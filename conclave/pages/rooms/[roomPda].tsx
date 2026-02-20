"use client";

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";
import { getMemberPda } from "../../lib/conclave";
import ChatRoom from "../../components/ChatRoom";
import MemberList from "../../components/MemberList";
import RealmsGovernance from "../../components/RealmsGovernance";
import {
  fetchRoom,
  fetchRoomMembers,
  fetchRoomProposals,
  fetchGroupKey as fetchGroupKeyFromApi,
  postGroupKey,
  postGroupKeyWithRetry,
  pushMemberToIndexer,
  ApiProposal,
} from "../../lib/api";
import {
  fetchRealmInfo,
  verifyRealmsMembership,
  fetchRealmProposals as fetchRealmProposalsFromSdk,
  ProposalState,
  RealmProposal,
} from "../../app/sdk/realms";

const GROUP_KEY_STORAGE_PREFIX = "conclave_group_key_";

type Tab = "chat" | "proposals" | "members" | "realms";

interface RoomData {
  name: string;
  authority: string;
  governanceMint: string;
  memberCount: number;
  proposalCount: number;
  realmAddress: string | null;
}

export default function RoomDetailPage() {
  const router = useRouter();
  const { roomPda: roomPdaStr } = router.query;
  const { publicKey: wallet, connected } = useWallet();
  const { connection } = useConnection();
  const { program } = useConclaveProgram();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [tab, setTab] = useState<Tab>("chat");
  const [groupKey, setGroupKey] = useState<Uint8Array | null>(null);
  const [publishKeyLoading, setPublishKeyLoading] = useState(false);
  const [publishKeyDone, setPublishKeyDone] = useState(false);
  const [realmName, setRealmName] = useState<string | null>(null);
  const [realmMemberVerified, setRealmMemberVerified] = useState<boolean | null>(null);

  const inviteKey = typeof router.query.key === "string" ? router.query.key : null;
  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;
  const { programReadOnly } = useConclaveProgram();
  const [inviteCopied, setInviteCopied] = useState(false);

  // Fetch room data from indexer, fallback to chain if 404 (e.g. right after create)
  useEffect(() => {
    if (!roomPda) return;
    let cancelled = false;
    // Always check localStorage for realm address (most reliable source)
    const localRealm = typeof window !== "undefined"
      ? localStorage.getItem(`conclave_realm_${roomPda}`)
      : null;

    (async () => {
      try {
        const data = await fetchRoom(roomPda);
        if (cancelled) return;
        const realmAddr = data.realm_address || localRealm || null;
        // Cache realm address in localStorage for all users
        if (realmAddr && typeof window !== "undefined") {
          localStorage.setItem(`conclave_realm_${roomPda}`, realmAddr);
        }
        setRoom({
          name: data.name,
          authority: data.authority,
          governanceMint: data.governance_mint,
          memberCount: data.member_count,
          proposalCount: data.proposal_count,
          realmAddress: realmAddr,
        });
      } catch {
        if (cancelled) {
          setLoading(false);
          return;
        }
        // Indexer 404 (e.g. room just created): fetch from chain
        if (programReadOnly) {
          try {
            const acc = await (programReadOnly.account as any).daoRoom.fetch(
              new PublicKey(roomPda),
            );
            if (cancelled) return;
            setRoom({
              name: acc.name,
              authority: acc.authority.toBase58(),
              governanceMint: acc.governanceMint.toBase58(),
              memberCount: acc.memberCount,
              proposalCount: acc.proposalCount,
              realmAddress: localRealm || null,
            });
          } catch {
            if (!cancelled) setRoom(null);
          }
        } else {
          setRoom(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomPda, programReadOnly]);

  // Check membership from indexer, fallback to chain if not found
  useEffect(() => {
    if (!roomPda || !wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const members = await fetchRoomMembers(roomPda);
        const found = members.some((m) => m.wallet === wallet.toBase58());
        if (!cancelled) {
          if (found) {
            setIsMember(true);
            return;
          }
        }
      } catch {}

      // Fallback: check member PDA on-chain directly
      if (programReadOnly && !cancelled) {
        try {
          const roomPubkey = new PublicKey(roomPda);
          const memberPda = getMemberPda(roomPubkey, wallet, programReadOnly.programId);
          const acc = await connection.getAccountInfo(memberPda);
          if (!cancelled) setIsMember(!!acc);
        } catch {
          if (!cancelled) setIsMember(false);
        }
      } else {
        if (!cancelled) setIsMember(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomPda, wallet, programReadOnly, connection]);

  // Fetch Realm info if room is linked to a Realms DAO
  useEffect(() => {
    if (!room?.realmAddress || !wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const realmPubkey = new PublicKey(room.realmAddress!);
        const info = await fetchRealmInfo(connection, realmPubkey);
        if (cancelled) return;
        if (info) {
          setRealmName(info.name);
          const membership = await verifyRealmsMembership(
            connection,
            realmPubkey,
            info.communityMint,
            wallet,
          );
          if (!cancelled) {
            setRealmMemberVerified(
              membership !== null && membership.governingTokenDepositAmount.gtn(0),
            );
          }
        }
      } catch {
        // Non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [room?.realmAddress, wallet, connection]);

  // Load group key from localStorage, invite link, or indexer.
  // If creator has key locally but indexer doesn't, auto-republish it.
  useEffect(() => {
    if (!roomPda) return;
    let cancelled = false;
    (async () => {
      let localKey: Uint8Array | null = null;

      // If invite link has a key, store it immediately
      if (inviteKey) {
        try {
          const decoded = Uint8Array.from(atob(inviteKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
          localStorage.setItem(GROUP_KEY_STORAGE_PREFIX + roomPda, JSON.stringify(Array.from(decoded)));
          localKey = decoded;
          if (!cancelled) setGroupKey(decoded);
        } catch {}
      }

      // Try localStorage first
      if (!localKey) {
        try {
          const raw = localStorage.getItem(GROUP_KEY_STORAGE_PREFIX + roomPda);
          if (raw) {
            const arr = JSON.parse(raw) as number[];
            localKey = new Uint8Array(arr);
            if (!cancelled) setGroupKey(localKey);
          }
        } catch {}
      }

      // Fetch from indexer
      let indexerHasKey = false;
      try {
        const keyBase64 = await fetchGroupKeyFromApi(roomPda);
        if (keyBase64) {
          indexerHasKey = true;
          const arr = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
          localStorage.setItem(
            GROUP_KEY_STORAGE_PREFIX + roomPda,
            JSON.stringify(Array.from(arr)),
          );
          if (!cancelled) setGroupKey(arr);
        }
      } catch {}

      // Auto-republish: if we have the key locally but indexer doesn't,
      // and the current wallet is the room authority, push it in the background
      if (localKey && !indexerHasKey && !cancelled && room && wallet) {
        const isCreator = room.authority === wallet.toBase58();
        if (isCreator) {
          const b64 = btoa(String.fromCharCode(...localKey));
          postGroupKeyWithRetry(roomPda, b64).then(() => {
            if (!cancelled) setPublishKeyDone(true);
          }).catch((err) => {
            console.warn("Auto-republish group key failed:", err);
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [roomPda, room, wallet, inviteKey]);

  const handleJoin = async () => {
    if (!program || !wallet || !roomPda || !room) return;

    setJoinLoading(true);
    setJoinError("");
    try {
      // Prefer key from indexer; if unavailable, creator can use key from localStorage (saved when they created the room)
      let keyBytes: Uint8Array;
      const keyBase64 = await fetchGroupKeyFromApi(roomPda);
      if (keyBase64) {
        keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
      } else {
        const isCreator = room.authority === wallet.toBase58();
        const localKey = localStorage.getItem(
          GROUP_KEY_STORAGE_PREFIX + roomPda,
        );
        if (isCreator && localKey) {
          try {
            const arr = JSON.parse(localKey) as number[];
            keyBytes = new Uint8Array(arr);
          } catch {
            setJoinError(
              "Could not use saved key. Start the indexer (cd indexer && npm run dev) or create the room again from this browser.",
            );
            return;
          }
        } else {
          setJoinError(
            "Room key not available (indexer may be stopped: run cd indexer && npm run dev). If you're the room creator on this browser, the key is saved — try joining again.",
          );
          return;
        }
      }

      // Anchor expects bytes as Buffer or Uint8Array
      const keyForInstruction =
        typeof Buffer !== "undefined"
          ? Buffer.from(keyBytes)
          : new Uint8Array(keyBytes);

      const roomPubkey = new PublicKey(roomPda);
      const memberPda = getMemberPda(roomPubkey, wallet, program.programId);
      const governanceMint = new PublicKey(room.governanceMint);
      const tokenAccount = getAssociatedTokenAddressSync(
        governanceMint,
        wallet,
      );

      // Create the ATA if it doesn't exist (e.g. wallet never held this token)
      const preInstructions = [];
      const ataInfo = await connection.getAccountInfo(tokenAccount);
      if (!ataInfo) {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            wallet,
            tokenAccount,
            wallet,
            governanceMint,
          ),
        );
      }

      await program.methods
        .joinRoom(keyForInstruction)
        .accountsPartial({
          wallet,
          room: roomPubkey,
          tokenAccount,
          member: memberPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions(preInstructions)
        .rpc();

      localStorage.setItem(
        GROUP_KEY_STORAGE_PREFIX + roomPda,
        JSON.stringify(Array.from(keyBytes)),
      );
      setGroupKey(keyBytes);
      setIsMember(true);
      // Push member data directly to indexer (no RPC needed)
      pushMemberToIndexer(
        memberPda.toBase58(),
        wallet.toBase58(),
        roomPda,
        Math.floor(Date.now() / 1000),
      );
    } catch (err: any) {
      setJoinError(err?.message || "Join failed");
    } finally {
      setJoinLoading(false);
    }
  };

  if (!roomPda) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-conclave-muted">Invalid room.</p>
        <Link href="/rooms" className="btn-primary mt-4 inline-block">
          Back to rooms
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center text-conclave-muted">
        Loading room…
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-conclave-muted">Room not found.</p>
        <Link href="/rooms" className="btn-primary mt-4 inline-block">
          Back to rooms
        </Link>
      </div>
    );
  }

  const roomPubkey = new PublicKey(roomPda);

  if (!connected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-conclave-muted">
          Connect your wallet to view this room.
        </p>
        <Link href="/" className="btn-primary mt-4 inline-block">
          Home
        </Link>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10">
        <Link
          href="/rooms"
          className="text-conclave-accent text-sm mb-4 inline-block"
        >
          ← Rooms
        </Link>
        <div className="card">
          <h1 className="text-2xl font-bold text-white mb-2">{room.name}</h1>
          {room.realmAddress && realmName && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
                Realms DAO
              </span>
              <a
                href={`https://app.realms.today/dao/${room.realmAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-conclave-accent hover:underline"
              >
                {realmName} &rarr;
              </a>
            </div>
          )}
          <p className="text-conclave-muted text-sm mb-4">
            {room.memberCount} members · {room.proposalCount} proposals
          </p>
          <p className="text-xs text-conclave-muted font-mono mb-4 break-all">
            Governance mint: {room.governanceMint}
          </p>

          {room.realmAddress && realmName ? (
            <div className="mb-4">
              <p className="text-sm text-gray-300 mb-2">
                This room requires membership in <span className="text-white font-medium">{realmName}</span> DAO.
              </p>
              {realmMemberVerified === true && (
                <p className="text-xs text-green-400 flex items-center gap-1 mb-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                  Verified Realms DAO member
                </p>
              )}
              {realmMemberVerified === false && (
                <p className="text-xs text-yellow-400 flex items-center gap-1 mb-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-400"></span>
                  Not a member of this Realm — you still need the governance token to join
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-300 mb-4">
              You need at least 1 governance token to join.
            </p>
          )}
          {joinError && (
            <p className="text-red-400 text-sm mb-3">{joinError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleJoin}
              disabled={joinLoading}
              className="btn-primary"
            >
              {joinLoading ? "Joining…" : "Join room"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isAuthority = room && wallet && room.authority === wallet.toBase58();

  const copyInviteLink = () => {
    if (!groupKey || !roomPda) return;
    const keyBase64 = btoa(String.fromCharCode(...groupKey))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${baseUrl}/rooms/${roomPda}?key=${keyBase64}`;
    navigator.clipboard.writeText(link).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  };

  const handlePublishKey = async () => {
    if (!roomPda || !groupKey) return;
    setPublishKeyLoading(true);
    try {
      const b64 = btoa(String.fromCharCode(...groupKey));
      await postGroupKey(roomPda, b64);
      setPublishKeyDone(true);
    } catch {
      // ignore
    } finally {
      setPublishKeyLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/rooms"
        className="text-conclave-accent text-sm mb-4 inline-block"
      >
        ← Rooms
      </Link>
      <div className="flex items-center gap-4 mb-4">
        <h1 className="text-2xl font-bold text-white">{room.name}</h1>
        {room.realmAddress && (
          <a
            href={`https://app.realms.today/dao/${room.realmAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium hover:bg-purple-500/30 transition"
          >
            {realmName ? `${realmName}` : "Realms DAO"} &rarr;
          </a>
        )}
        {groupKey && (
          <button
            onClick={copyInviteLink}
            className="text-xs px-3 py-1 rounded-full border border-conclave-border text-conclave-muted hover:text-conclave-accent hover:border-conclave-accent transition"
          >
            {inviteCopied ? "Copied!" : "Copy invite link"}
          </button>
        )}
      </div>

      {isAuthority && groupKey && (
        <div className="mb-4 p-3 rounded-lg bg-conclave-card border border-conclave-border text-sm text-conclave-muted">
          {publishKeyDone ? (
            <span className="text-green-400">
              Room key saved to server. Others can join.
            </span>
          ) : (
            <>
              The room key is usually saved automatically when you create a room
              (if the indexer is running). If someone couldn’t join, start the
              indexer (
              <code className="text-xs bg-conclave-dark px-1 rounded">
                cd indexer && npm run dev
              </code>
              ) and{" "}
              <button
                type="button"
                onClick={handlePublishKey}
                disabled={publishKeyLoading}
                className="text-conclave-accent hover:underline disabled:opacity-50"
              >
                {publishKeyLoading ? "Publishing…" : "save the key now"}
              </button>
              .
            </>
          )}
        </div>
      )}

      <div className="flex gap-2 border-b border-conclave-border mb-6 overflow-x-auto pb-px -mx-4 px-4 sm:mx-0 sm:px-0">
        {(["chat", "proposals", "members", ...(room.realmAddress ? ["realms" as const] : [])] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
              tab === t
                ? "bg-conclave-card border border-conclave-border border-b-0 text-conclave-accent"
                : "text-conclave-muted hover:text-white"
            }`}
          >
            {t === "chat" && "Chat"}
            {t === "proposals" && "Proposals"}
            {t === "members" && "Members"}
            {t === "realms" && "Realms DAO"}
          </button>
        ))}
      </div>

      {tab === "chat" && (
        <div className="card">
          <ChatRoom roomPda={roomPubkey} groupKey={groupKey} />
        </div>
      )}

      {tab === "proposals" && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-white">Proposals</h2>
            <Link
              href={`/rooms/${roomPda}/proposals/create`}
              className="btn-primary text-sm"
            >
              Create proposal
            </Link>
          </div>
          <ProposalsList roomPda={roomPda} realmAddress={room.realmAddress} />
        </div>
      )}

      {tab === "members" && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Members</h2>
            <MemberList roomPda={roomPubkey} />
          </div>
          {isAuthority && room && (
            <InviteSection governanceMint={room.governanceMint} />
          )}
        </div>
      )}

      {tab === "realms" && room.realmAddress && (
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Realms Governance</h2>
          <RealmsGovernance realmAddress={room.realmAddress} />
        </div>
      )}
    </div>
  );
}

function getProposalPhase(deadline: number, isFinalized: boolean): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  const now = Math.floor(Date.now() / 1000);
  if (isFinalized) {
    return { label: "Finalized", color: "text-conclave-muted", bgColor: "bg-white/5", borderColor: "border-white/10" };
  }
  if (now < deadline) {
    return { label: "Voting", color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" };
  }
  return { label: "Reveal", color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30" };
}

function formatTimeLeft(deadline: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) return "Ended";
  if (diff < 60) return `${diff}s left`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m left`;
  return `${Math.floor(diff / 86400)}d left`;
}

function getRealmProposalBadge(state: ProposalState): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  switch (state) {
    case ProposalState.Voting:
      return { label: "Voting", color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" };
    case ProposalState.Succeeded:
      return { label: "Passed", color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" };
    case ProposalState.Defeated:
      return { label: "Defeated", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" };
    case ProposalState.Completed:
      return { label: "Completed", color: "text-conclave-muted", bgColor: "bg-white/5", borderColor: "border-white/10" };
    case ProposalState.Executing:
    case ProposalState.ExecutingWithErrors:
      return { label: "Executing", color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30" };
    case ProposalState.Cancelled:
      return { label: "Cancelled", color: "text-conclave-muted", bgColor: "bg-white/5", borderColor: "border-white/10" };
    case ProposalState.Vetoed:
      return { label: "Vetoed", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" };
    case ProposalState.Draft:
      return { label: "Draft", color: "text-conclave-muted", bgColor: "bg-white/5", borderColor: "border-white/10" };
    case ProposalState.SigningOff:
      return { label: "Signing Off", color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30" };
    default:
      return { label: "Unknown", color: "text-conclave-muted", bgColor: "bg-white/5", borderColor: "border-white/10" };
  }
}

function ProposalsList({ roomPda, realmAddress }: { roomPda: string; realmAddress?: string | null }) {
  const { connection } = useConnection();
  const [list, setList] = useState<
    {
      publicKey: string;
      title: string;
      description: string;
      deadline: number;
      isFinalized: boolean;
      voteYesCount: number;
      voteNoCount: number;
    }[]
  >([]);
  const [realmProposals, setRealmProposals] = useState<RealmProposal[]>([]);
  const [realmProposalsError, setRealmProposalsError] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const proposals = await fetchRoomProposals(roomPda);
        setList(
          proposals.map((p: ApiProposal) => ({
            publicKey: p.address,
            title: p.title,
            description: p.description,
            deadline: p.deadline,
            isFinalized: p.is_finalized === 1,
            voteYesCount: p.vote_yes_count,
            voteNoCount: p.vote_no_count,
          })),
        );
      } catch {
        setList([]);
      }
    })();
  }, [roomPda]);

  // Fetch Realms proposals if room is linked
  useEffect(() => {
    if (!realmAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const realmPubkey = new PublicKey(realmAddress);
        const proposals = await fetchRealmProposalsFromSdk(connection, realmPubkey);
        if (!cancelled) setRealmProposals(proposals);
      } catch {
        if (!cancelled) setRealmProposalsError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [realmAddress, connection]);

  const hasNoProposals = list.length === 0 && realmProposals.length === 0;

  if (hasNoProposals && !realmProposalsError) {
    return <p className="text-conclave-muted text-sm">No proposals yet.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Realms proposals */}
      {realmProposals.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">Realms DAO Proposals</h3>
          <ul className="space-y-3">
            {realmProposals.map((rp) => {
              const badge = getRealmProposalBadge(rp.state);
              const yesVotes = parseInt(rp.yesVotes) || 0;
              const noVotes = parseInt(rp.noVotes) || 0;
              const totalVotes = yesVotes + noVotes;
              const yesPercent = totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 0;

              return (
                <li key={rp.pubkey}>
                  <a
                    href={`https://app.realms.today/dao/${realmAddress}/proposal/${rp.pubkey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl border border-purple-500/20 p-4 hover:border-purple-500/40 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
                          Realms
                        </span>
                        <h3 className="font-semibold text-white text-sm">{rp.name}</h3>
                      </div>
                      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${badge.bgColor} ${badge.color} border ${badge.borderColor} font-medium ${badge.label === "Voting" ? "animate-pulse" : ""}`}>
                        {badge.label}
                      </span>
                    </div>

                    {rp.descriptionLink && (
                      <p className="text-xs text-conclave-muted mb-3 line-clamp-1">{rp.descriptionLink}</p>
                    )}

                    {totalVotes > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-green-400 font-medium">Yes {yesPercent}%</span>
                          <span className="text-red-400 font-medium">No {100 - yesPercent}%</span>
                        </div>
                        <div className="h-1.5 bg-conclave-dark rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                            style={{ width: `${yesPercent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-conclave-muted mt-1">{totalVotes} votes</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-conclave-muted">
                      {rp.votingAt && <span>Started {new Date(rp.votingAt * 1000).toLocaleDateString()}</span>}
                      {rp.votingCompletedAt && <span>Ended {new Date(rp.votingCompletedAt * 1000).toLocaleDateString()}</span>}
                      {!rp.votingAt && !rp.votingCompletedAt && <span />}
                      <span className="text-purple-400">View on Realms &rarr;</span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {realmProposalsError && (
        <p className="text-xs text-conclave-muted italic">Could not load Realms proposals (rate limited or unavailable).</p>
      )}

      {/* Conclave proposals */}
      {list.length > 0 && (
        <div>
          {realmProposals.length > 0 && (
            <h3 className="text-xs font-medium text-conclave-accent uppercase tracking-wider mb-2">Conclave Proposals</h3>
          )}
          <ul className="space-y-3">
            {list.map((p) => {
              const phase = getProposalPhase(p.deadline, p.isFinalized);
              const totalVotes = p.voteYesCount + p.voteNoCount;
              const yesPercent = totalVotes > 0 ? Math.round((p.voteYesCount / totalVotes) * 100) : 0;
              const deadlinePassed = p.deadline <= now;

              return (
                <li key={p.publicKey}>
                  <Link
                    href={`/rooms/${roomPda}/proposals/${p.publicKey}`}
                    className="block rounded-xl border border-conclave-border/50 p-4 hover:border-conclave-accent/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-white text-sm">{p.title}</h3>
                      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${phase.bgColor} ${phase.color} border ${phase.borderColor} font-medium ${phase.label === "Voting" ? "animate-pulse" : ""}`}>
                        {phase.label}
                      </span>
                    </div>

                    {p.description && (
                      <p className="text-xs text-conclave-muted mb-3 line-clamp-1">{p.description}</p>
                    )}

                    {totalVotes > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-green-400 font-medium">Yes {yesPercent}%</span>
                          <span className="text-red-400 font-medium">No {100 - yesPercent}%</span>
                        </div>
                        <div className="h-1.5 bg-conclave-dark rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                            style={{ width: `${yesPercent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-conclave-muted mt-1">{totalVotes} votes</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-conclave-muted">
                      <span>{new Date(p.deadline * 1000).toLocaleString()}</span>
                      {!deadlinePassed && (
                        <span className="text-conclave-accent font-medium">{formatTimeLeft(p.deadline)}</span>
                      )}
                      {deadlinePassed && !p.isFinalized && (
                        <span className="text-yellow-400 font-medium">Awaiting reveals</span>
                      )}
                      {p.isFinalized && totalVotes > 0 && (
                        <span className={`font-bold ${p.voteYesCount > p.voteNoCount ? "text-green-400" : p.voteNoCount > p.voteYesCount ? "text-red-400" : "text-yellow-400"}`}>
                          {p.voteYesCount > p.voteNoCount ? "PASSED" : p.voteNoCount > p.voteYesCount ? "REJECTED" : "TIED"}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function InviteSection({ governanceMint }: { governanceMint: string }) {
  const { publicKey: wallet, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [inviteeAddress, setInviteeAddress] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  // Fetch creator's token balance
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const mint = new PublicKey(governanceMint);
        const ata = getAssociatedTokenAddressSync(mint, wallet);
        const account = await getAccount(connection, ata);
        if (!cancelled) setTokenBalance(Number(account.amount));
      } catch {
        if (!cancelled) setTokenBalance(0);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, governanceMint, connection, sending]);

  const handleSendInvite = async () => {
    if (!wallet || !inviteeAddress.trim()) return;
    setSending(true);
    setStatus(null);

    try {
      const inviteePubkey = new PublicKey(inviteeAddress.trim());
      const mint = new PublicKey(governanceMint);

      const creatorAta = getAssociatedTokenAddressSync(mint, wallet);
      const inviteeAta = getAssociatedTokenAddressSync(mint, inviteePubkey);

      const tx = new Transaction();

      // Create invitee's ATA if it doesn't exist
      const inviteeAtaInfo = await connection.getAccountInfo(inviteeAta);
      if (!inviteeAtaInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            wallet,
            inviteeAta,
            inviteePubkey,
            mint,
          )
        );
      }

      // Transfer 1 token
      tx.add(
        createTransferInstruction(
          creatorAta,
          inviteeAta,
          wallet,
          1,
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet;

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setStatus({ type: "success", message: `Sent 1 token to ${inviteePubkey.toBase58().slice(0, 8)}...` });
      setInviteeAddress("");
    } catch (err: any) {
      setStatus({ type: "error", message: err?.message || "Transfer failed" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card">
      <h2 className="font-semibold text-white mb-1">Invite a Member</h2>
      <p className="text-xs text-conclave-muted mb-4">
        Send 1 governance token to invite someone to this room.
        {tokenBalance !== null && (
          <span className="ml-2 text-conclave-accent font-medium">
            Balance: {tokenBalance} token{tokenBalance !== 1 ? "s" : ""}
          </span>
        )}
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={inviteeAddress}
          onChange={(e) => setInviteeAddress(e.target.value)}
          placeholder="Wallet address (e.g. 7xK...)"
          className="flex-1 bg-conclave-dark border border-conclave-border rounded-lg px-3 py-2 text-sm text-white placeholder-conclave-muted focus:outline-none focus:border-conclave-accent"
        />
        <button
          onClick={handleSendInvite}
          disabled={sending || !inviteeAddress.trim() || tokenBalance === 0}
          className="btn-primary text-sm whitespace-nowrap disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send Invite Token"}
        </button>
      </div>

      {status && (
        <p className={`text-sm mt-2 ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
