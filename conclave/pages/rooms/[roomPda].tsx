"use client";

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";
import { getMemberPda } from "../../lib/conclave";
import ChatRoom from "../../components/ChatRoom";
import MemberList from "../../components/MemberList";
import {
  fetchRoom,
  fetchRoomMembers,
  fetchRoomProposals,
  fetchGroupKey as fetchGroupKeyFromApi,
  postGroupKey,
  postGroupKeyWithRetry,
  notifyIndexer,
  ApiProposal,
} from "../../lib/api";

const GROUP_KEY_STORAGE_PREFIX = "conclave_group_key_";

type Tab = "chat" | "proposals" | "members";

interface RoomData {
  name: string;
  authority: string;
  governanceMint: string;
  memberCount: number;
  proposalCount: number;
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

  const inviteKey = typeof router.query.key === "string" ? router.query.key : null;
  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;
  const { programReadOnly } = useConclaveProgram();
  const [inviteCopied, setInviteCopied] = useState(false);

  // Fetch room data from indexer, fallback to chain if 404 (e.g. right after create)
  useEffect(() => {
    if (!roomPda) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRoom(roomPda);
        if (cancelled) return;
        setRoom({
          name: data.name,
          authority: data.authority,
          governanceMint: data.governance_mint,
          memberCount: data.member_count,
          proposalCount: data.proposal_count,
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
      // Notify indexer about the new member + updated room
      notifyIndexer([memberPda.toBase58(), roomPda]);
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
          <p className="text-conclave-muted text-sm mb-4">
            {room.memberCount} members · {room.proposalCount} proposals
          </p>
          <p className="text-xs text-conclave-muted font-mono mb-6 break-all">
            Governance mint: {room.governanceMint}
          </p>

          <p className="text-sm text-gray-300 mb-4">
            You need at least 1 governance token to join.
          </p>
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
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">{room.name}</h1>
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

      <div className="flex gap-2 border-b border-conclave-border mb-6">
        {(["chat", "proposals", "members"] as const).map((t) => (
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
          <ProposalsList roomPda={roomPda} />
        </div>
      )}

      {tab === "members" && (
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Members</h2>
          <MemberList roomPda={roomPubkey} />
        </div>
      )}
    </div>
  );
}

function ProposalsList({ roomPda }: { roomPda: string }) {
  const [list, setList] = useState<
    {
      publicKey: string;
      title: string;
      deadline: number;
      isFinalized: boolean;
    }[]
  >([]);

  useEffect(() => {
    (async () => {
      try {
        const proposals = await fetchRoomProposals(roomPda);
        setList(
          proposals.map((p: ApiProposal) => ({
            publicKey: p.address,
            title: p.title,
            deadline: p.deadline,
            isFinalized: p.is_finalized === 1,
          })),
        );
      } catch {
        setList([]);
      }
    })();
  }, [roomPda]);

  if (list.length === 0) {
    return <p className="text-conclave-muted text-sm">No proposals yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {list.map((p) => (
        <li key={p.publicKey}>
          <Link
            href={`/rooms/${roomPda}/proposals/${p.publicKey}`}
            className="block py-2 border-b border-conclave-border/50 hover:text-conclave-accent"
          >
            <span className="font-medium text-white">{p.title}</span>
            <span className="text-conclave-muted text-sm ml-2">
              {p.isFinalized ? "Finalized" : "Open"} ·{" "}
              {new Date(p.deadline * 1000).toLocaleString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
