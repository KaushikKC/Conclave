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
import { Keypair } from "@solana/web3.js";
import ChatRoom from "../../components/ChatRoom";
import MemberList from "../../components/MemberList";
import RealmsGovernance from "../../components/RealmsGovernance";
import TreasuryCard from "../../components/TreasuryCard";
import dynamic from "next/dynamic";
const ZKMembershipCard = dynamic(
  () => import("../../components/ZKMembershipCard"),
  { ssr: false },
);
import {
  useSessionKey,
  generateAndStoreSessionKeypair,
  clearSessionKeypair,
  getSessionPda,
} from "../../hooks/useSessionKey";
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

type Tab = "chat" | "proposals" | "members" | "treasury" | "realms" | "zk";

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
  const [realmMemberVerified, setRealmMemberVerified] = useState<
    boolean | null
  >(null);
  const [sessionKeypair, setSessionKeypair] = useState<Keypair | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");

  const inviteKey =
    typeof router.query.key === "string" ? router.query.key : null;
  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;
  const { programReadOnly } = useConclaveProgram();
  const [inviteCopied, setInviteCopied] = useState(false);

  // Fetch room data from indexer, fallback to chain if 404 (e.g. right after create)
  useEffect(() => {
    if (!roomPda) return;
    let cancelled = false;
    // Always check localStorage for realm address (most reliable source)
    const localRealm =
      typeof window !== "undefined"
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
      } catch { }

      // Fallback: check member PDA on-chain directly
      if (programReadOnly && !cancelled) {
        try {
          const roomPubkey = new PublicKey(roomPda);
          const memberPda = getMemberPda(
            roomPubkey,
            wallet,
            programReadOnly.programId,
          );
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
              membership !== null &&
              membership.governingTokenDepositAmount.gtn(0),
            );
          }
        }
      } catch {
        // Non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
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
          const decoded = Uint8Array.from(
            atob(inviteKey.replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0),
          );
          localStorage.setItem(
            GROUP_KEY_STORAGE_PREFIX + roomPda,
            JSON.stringify(Array.from(decoded)),
          );
          localKey = decoded;
          if (!cancelled) setGroupKey(decoded);
        } catch { }
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
        } catch { }
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
      } catch { }

      // Auto-republish: if we have the key locally but indexer doesn't,
      // and the current wallet is the room authority, push it in the background
      if (localKey && !indexerHasKey && !cancelled && room && wallet) {
        const isCreator = room.authority === wallet.toBase58();
        if (isCreator) {
          const b64 = btoa(String.fromCharCode(...localKey));
          postGroupKeyWithRetry(roomPda, b64)
            .then(() => {
              if (!cancelled) setPublishKeyDone(true);
            })
            .catch((err) => {
              console.warn("Auto-republish group key failed:", err);
            });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomPda, room, wallet, inviteKey]);

  // Load existing session keypair from localStorage on mount
  useEffect(() => {
    if (!roomPda) return;
    const stored = (() => {
      try {
        const raw = localStorage.getItem("conclave_sk_" + roomPda);
        if (!raw) return null;
        const { secretKey, expiresAt } = JSON.parse(raw);
        if (expiresAt < Math.floor(Date.now() / 1000)) return null;
        return Keypair.fromSecretKey(new Uint8Array(secretKey));
      } catch {
        return null;
      }
    })();
    setSessionKeypair(stored);
  }, [roomPda]);

  const handleCreateSession = async () => {
    if (!program || !wallet || !roomPda) return;
    setSessionLoading(true);
    setSessionError("");
    try {
      const { keypair, expiresAt } = generateAndStoreSessionKeypair(roomPda);
      const roomPubkey = new PublicKey(roomPda);
      const sessionPda = getSessionPda(roomPubkey, wallet, program.programId);
      const memberPda = getMemberPda(roomPubkey, wallet, program.programId);

      // Fund session key with 0.005 SOL for fees + create session PDA
      const fundIx = require("@solana/web3.js").SystemProgram.transfer({
        fromPubkey: wallet,
        toPubkey: keypair.publicKey,
        lamports: 100_000_000, // 0.1 SOL — covers ~11 open message accounts (0.0086 SOL rent each)
      });

      const sessionIx = await program.methods
        .createSession(
          keypair.publicKey,
          new (require("@coral-xyz/anchor").BN)(expiresAt),
        )
        .accountsPartial({
          wallet,
          room: roomPubkey,
          member: memberPda,
          session: sessionPda,
          systemProgram: require("@solana/web3.js").SystemProgram.programId,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new (require("@solana/web3.js").Transaction)();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = wallet;
      tx.add(fundIx, sessionIx);

      const sig = await (program.provider as any).wallet.sendTransaction(
        tx,
        connection,
      );
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      setSessionKeypair(keypair);
    } catch (err: any) {
      setSessionError(err?.message || "Failed to create session");
      clearSessionKeypair(roomPda);
    } finally {
      setSessionLoading(false);
    }
  };

  const handleClearSession = () => {
    if (!roomPda) return;
    clearSessionKeypair(roomPda);
    setSessionKeypair(null);
  };

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
      <div className="max-w-2xl mx-auto px-6 py-16 relative">
        {/* Background blobs */}
        <div className="absolute top-0 -left-64 w-96 h-96 bg-conclave-pink/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob z-0 pointer-events-none"></div>
        <div className="absolute -bottom-64 -right-64 w-96 h-96 bg-conclave-blue/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000 z-0 pointer-events-none"></div>

        <div className="relative z-10">
          <Link
            href="/rooms"
            className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-conclave-textMuted hover:text-white transition-colors mb-8"
          >
            <span className="text-conclave-pink">&larr;</span> Back to Rooms
          </Link>
          <div className="rounded-3xl border border-white/10 bg-conclave-card/60 p-8 sm:p-12 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <h1 className="text-3xl md:text-4xl font-black text-conclave-text uppercase tracking-widest mb-4 flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-conclave-pink rounded-full shadow-[0_0_15px_rgba(255,77,141,0.8)] animate-pulse"></div>
              {room.name}
            </h1>
            {room.realmAddress && realmName && (
              <div className="flex items-center gap-2 mb-6">
                <span className="text-[10px] px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold uppercase tracking-widest">
                  Realms DAO
                </span>
                <a
                  href={`https://app.realms.today/dao/${room.realmAddress}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] uppercase font-bold tracking-widest text-conclave-blue hover:text-white hover:underline transition-colors"
                >
                  {realmName} &nearr;
                </a>
              </div>
            )}

            <div className="flex gap-6 mb-8 pb-8 border-b border-white/5">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mb-1">Members</p>
                <p className="text-lg font-mono text-white">{room.memberCount}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mb-1">Proposals</p>
                <p className="text-lg font-mono text-white">{room.proposalCount}</p>
              </div>
            </div>

            <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mb-2">Governance Mint</p>
            <p className="text-xs text-white/80 font-mono mb-8 p-3 bg-black/50 rounded-lg border border-white/5 break-all">
              {room.governanceMint}
            </p>

            {room.realmAddress && realmName ? (
              <div className="mb-8 p-4 rounded-xl border border-conclave-blue/20 bg-conclave-blue/5">
                <p className="text-xs text-conclave-text/80 mb-3 leading-relaxed">
                  This room requires membership in the <span className="text-white font-bold">{realmName}</span> DAO.
                </p>
                {realmMemberVerified === true && (
                  <p className="text-[10px] uppercase font-bold tracking-widest text-green-400 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                    Verified Realms DAO member
                  </p>
                )}
                {realmMemberVerified === false && (
                  <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-yellow flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-conclave-yellow"></span>
                    Not a member of this Realm
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mb-6 p-4 rounded-xl border border-white/5 bg-black/30">
                Requires at least 1 governance token to join.
              </p>
            )}

            {joinError && (
              <p className="text-red-400 text-[10px] uppercase tracking-wider mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">{joinError}</p>
            )}

            <button
              onClick={handleJoin}
              disabled={joinLoading || (room.realmAddress ? realmMemberVerified === false : false)}
              className="btn-primary w-full shadow-[0_0_30px_rgba(255,77,141,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {joinLoading ? "Decrypting Key…" : "Join Workspace"}
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
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
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

  // Tab active colors match landing "How it works": Create=pink, Discuss=yellow, Vote=green, Reveal=blue
  const tabActiveStyles: Record<typeof tab, string> = {
    chat: "bg-gradient-to-br from-conclave-yellow/20 to-conclave-yellow/5 border-conclave-yellow/30 border-b-0 text-conclave-text shadow-[0_-5px_20px_rgba(255,200,0,0.08)]",
    proposals: "bg-gradient-to-br from-conclave-green/20 to-conclave-green/5 border-conclave-green/30 border-b-0 text-conclave-text shadow-[0_-5px_20px_rgba(0,201,167,0.08)]",
    members: "bg-gradient-to-br from-conclave-pink/20 to-conclave-pink/5 border-conclave-pink/30 border-b-0 text-conclave-text shadow-[0_-5px_20px_rgba(255,77,141,0.08)]",
    treasury: "bg-gradient-to-br from-conclave-blue/20 to-conclave-blue/5 border-conclave-blue/30 border-b-0 text-conclave-text shadow-[0_-5px_20px_rgba(0,184,241,0.08)]",
    zk: "bg-gradient-to-br from-conclave-pink/20 to-conclave-pink/5 border-conclave-pink/30 border-b-0 text-conclave-text shadow-[0_-5px_20px_rgba(255,77,141,0.08)]",
    realms: "bg-gradient-to-br from-conclave-blue/20 to-conclave-blue/5 border-conclave-blue/30 border-b-0 text-conclave-text shadow-[0_-5px_20px_rgba(0,184,241,0.08)]",
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 relative">
      {/* Background blobs */}
      <div className="absolute top-20 -left-64 w-96 h-96 bg-conclave-pink/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob z-0 pointer-events-none"></div>

      <div className="relative z-10 mb-8 border-b border-white/10 pb-6">
        <Link
          href="/rooms"
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-conclave-textMuted hover:text-white transition-colors mb-6"
        >
          <span className="text-conclave-pink">&larr;</span> Rooms
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-black text-white uppercase tracking-widest flex items-center gap-3">
              <div className="w-3 h-3 bg-conclave-blue rounded-full shadow-[0_0_15px_rgba(0,184,241,0.8)] animate-pulse"></div>
              {room.name}
            </h1>
            {room.realmAddress && (
              <a
                href={`https://app.realms.today/dao/${room.realmAddress}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold uppercase tracking-widest hover:bg-purple-500/20 transition-colors"
              >
                {realmName ? `${realmName}` : "Realms DAO"} &nearr;
              </a>
            )}
          </div>

          {groupKey && (
            <button
              onClick={copyInviteLink}
              className="btn-secondary !px-6 !py-2.5 shadow-[0_0_20px_rgba(237,224,212,0.1)] transition-all relative overflow-hidden group"
            >
              <span className="relative z-10">{inviteCopied ? "Link Copied!" : "Share Link"}</span>
              {inviteCopied && <div className="absolute inset-0 bg-conclave-green/20 z-0"></div>}
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10">
        {isAuthority && groupKey && (
          <div className="mb-6 p-4 rounded-xl bg-black/40 border border-conclave-yellow/20 text-xs font-medium text-conclave-textMuted leading-relaxed">
            {publishKeyDone ? (
              <span className="text-green-400 flex items-center gap-2 uppercase tracking-widest text-[10px]">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                Workspace key synchronized to network.
              </span>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span>
                  To allow others to join, ensure the indexer is running and save the workspace key.
                </span>
                <button
                  type="button"
                  onClick={handlePublishKey}
                  disabled={publishKeyLoading}
                  className="btn-primary !py-2 !px-4 !text-[10px] whitespace-nowrap disabled:opacity-50"
                >
                  {publishKeyLoading ? "Syncing…" : "Sync Room Key"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Session key banner */}
        {isMember && (
          <div className="mb-8">
            {sessionKeypair ? (
              <div className="flex items-center justify-between px-5 py-3 rounded-xl bg-green-500/5 border border-green-500/20 text-xs">
                <span className="text-green-400 font-bold uppercase tracking-widest flex items-center gap-2 text-[10px]">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                  Gas-Free Mode Active
                </span>
                <button
                  onClick={handleClearSession}
                  className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted hover:text-red-400 transition ml-4"
                >
                  Revoke Session
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 rounded-xl bg-black/40 border border-white/10 text-xs gap-4">
                <span className="text-conclave-textMuted leading-relaxed">
                  <span className="text-white font-bold">Enable Session Key</span> — sign once, chat without wallet popups.
                </span>
                <button
                  onClick={handleCreateSession}
                  disabled={sessionLoading}
                  className="btn-primary !py-2 !px-6 !text-[10px] shadow-[0_0_15px_rgba(255,77,141,0.2)] disabled:opacity-50 whitespace-nowrap"
                >
                  {sessionLoading ? "Initializing…" : "Enable Session ⚡"}
                </button>
              </div>
            )}
            {sessionError && (
              <p className="text-red-400 text-[10px] uppercase tracking-widest mt-2 px-2">{sessionError}</p>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 sm:gap-4 mb-8 overflow-x-auto pb-2 scrollbar-hide border-b border-white/5">
          {(
            [
              "chat",
              "proposals",
              "members",
              "treasury",
              "zk",
              ...(room.realmAddress ? ["realms" as const] : []),
            ] as const
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-t-xl transition-all whitespace-nowrap border ${tab === t
                  ? tabActiveStyles[t]
                  : "text-conclave-textMuted hover:text-white hover:bg-white/5 border-transparent"
                }`}
            >
              {t === "chat" && "Encrypted Chat"}
              {t === "proposals" && "Proposals"}
              {t === "members" && "Roster"}
              {t === "treasury" && "Treasury"}
              {t === "zk" && "Zero-Knowledge"}
              {t === "realms" && "Realms Setup"}
            </button>
          ))}
        </div>
      </div>

      {tab === "chat" && (
        <div className="card">
          <ChatRoom
            roomPda={roomPubkey}
            groupKey={groupKey}
            sessionKeypair={sessionKeypair}
          />
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

      {tab === "treasury" && (
        <div className="card">
          <TreasuryCard roomPda={roomPda} roomAuthority={room.authority} />
        </div>
      )}

      {tab === "zk" && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-semibold text-white">ZK Proof of Membership</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
              Groth16 · Semaphore
            </span>
          </div>
          <ZKMembershipCard roomPda={roomPda} isMember={isMember} />
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

function getProposalPhase(
  deadline: number,
  isFinalized: boolean,
): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  const now = Math.floor(Date.now() / 1000);
  if (isFinalized) {
    return {
      label: "Finalized",
      color: "text-conclave-muted",
      bgColor: "bg-white/5",
      borderColor: "border-white/10",
    };
  }
  if (now < deadline) {
    return {
      label: "Voting",
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
    };
  }
  return {
    label: "Reveal",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
  };
}

function formatTimeLeft(deadline: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) return "Ended";
  if (diff < 60) return `${diff}s left`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400)
    return `${Math.floor(diff / 3600)}h ${Math.floor(
      (diff % 3600) / 60,
    )}m left`;
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
      return {
        label: "Voting",
        color: "text-green-400",
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/30",
      };
    case ProposalState.Succeeded:
      return {
        label: "Passed",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/30",
      };
    case ProposalState.Defeated:
      return {
        label: "Defeated",
        color: "text-red-400",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/30",
      };
    case ProposalState.Completed:
      return {
        label: "Completed",
        color: "text-conclave-muted",
        bgColor: "bg-white/5",
        borderColor: "border-white/10",
      };
    case ProposalState.Executing:
    case ProposalState.ExecutingWithErrors:
      return {
        label: "Executing",
        color: "text-yellow-400",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/30",
      };
    case ProposalState.Cancelled:
      return {
        label: "Cancelled",
        color: "text-conclave-muted",
        bgColor: "bg-white/5",
        borderColor: "border-white/10",
      };
    case ProposalState.Vetoed:
      return {
        label: "Vetoed",
        color: "text-red-400",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/30",
      };
    case ProposalState.Draft:
      return {
        label: "Draft",
        color: "text-conclave-muted",
        bgColor: "bg-white/5",
        borderColor: "border-white/10",
      };
    case ProposalState.SigningOff:
      return {
        label: "Signing Off",
        color: "text-yellow-400",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/30",
      };
    default:
      return {
        label: "Unknown",
        color: "text-conclave-muted",
        bgColor: "bg-white/5",
        borderColor: "border-white/10",
      };
  }
}

function ProposalsList({
  roomPda,
  realmAddress,
}: {
  roomPda: string;
  realmAddress?: string | null;
}) {
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
    const interval = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
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
        const proposals = await fetchRealmProposalsFromSdk(
          connection,
          realmPubkey,
        );
        if (!cancelled) setRealmProposals(proposals);
      } catch {
        if (!cancelled) setRealmProposalsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
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
          <h3 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">
            Realms DAO Proposals
          </h3>
          <ul className="space-y-3">
            {realmProposals.map((rp) => {
              const badge = getRealmProposalBadge(rp.state);
              const yesVotes = parseInt(rp.yesVotes) || 0;
              const noVotes = parseInt(rp.noVotes) || 0;
              const totalVotes = yesVotes + noVotes;
              const yesPercent =
                totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 0;

              return (
                <li key={rp.pubkey}>
                  <a
                    href={`https://app.realms.today/dao/${realmAddress}/proposal/${rp.pubkey}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl border border-purple-500/20 p-4 hover:border-purple-500/40 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
                          Realms
                        </span>
                        <h3 className="font-semibold text-white text-sm">
                          {rp.name}
                        </h3>
                      </div>
                      <span
                        className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${badge.bgColor
                          } ${badge.color} border ${badge.borderColor
                          } font-medium ${badge.label === "Voting" ? "animate-pulse" : ""
                          }`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {rp.descriptionLink && (
                      <p className="text-xs text-conclave-muted mb-3 line-clamp-1">
                        {rp.descriptionLink}
                      </p>
                    )}

                    {totalVotes > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-green-400 font-medium">
                            Yes {yesPercent}%
                          </span>
                          <span className="text-red-400 font-medium">
                            No {100 - yesPercent}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-conclave-dark rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                            style={{ width: `${yesPercent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-conclave-muted mt-1">
                          {totalVotes} votes
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-conclave-muted">
                      {rp.votingAt && (
                        <span>
                          Started{" "}
                          {new Date(rp.votingAt * 1000).toLocaleDateString()}
                        </span>
                      )}
                      {rp.votingCompletedAt && (
                        <span>
                          Ended{" "}
                          {new Date(
                            rp.votingCompletedAt * 1000,
                          ).toLocaleDateString()}
                        </span>
                      )}
                      {!rp.votingAt && !rp.votingCompletedAt && <span />}
                      <span className="text-purple-400">
                        View on Realms &rarr;
                      </span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {realmProposalsError && (
        <p className="text-xs text-conclave-muted italic">
          Could not load Realms proposals (rate limited or unavailable).
        </p>
      )}

      {/* Conclave proposals */}
      {list.length > 0 && (
        <div>
          {realmProposals.length > 0 && (
            <h3 className="text-xs font-medium text-conclave-accent uppercase tracking-wider mb-2">
              Conclave Proposals
            </h3>
          )}
          <ul className="space-y-3">
            {list.map((p) => {
              const phase = getProposalPhase(p.deadline, p.isFinalized);
              const totalVotes = p.voteYesCount + p.voteNoCount;
              const yesPercent =
                totalVotes > 0
                  ? Math.round((p.voteYesCount / totalVotes) * 100)
                  : 0;
              const deadlinePassed = p.deadline <= now;

              return (
                <li key={p.publicKey}>
                  <Link
                    href={`/rooms/${roomPda}/proposals/${p.publicKey}`}
                    className="block rounded-xl border border-conclave-border/50 p-4 hover:border-conclave-accent/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-white text-sm">
                        {p.title}
                      </h3>
                      <span
                        className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${phase.bgColor
                          } ${phase.color} border ${phase.borderColor
                          } font-medium ${phase.label === "Voting" ? "animate-pulse" : ""
                          }`}
                      >
                        {phase.label}
                      </span>
                    </div>

                    {p.description && (
                      <p className="text-xs text-conclave-muted mb-3 line-clamp-1">
                        {p.description}
                      </p>
                    )}

                    {totalVotes > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-green-400 font-medium">
                            Yes {yesPercent}%
                          </span>
                          <span className="text-red-400 font-medium">
                            No {100 - yesPercent}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-conclave-dark rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                            style={{ width: `${yesPercent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-conclave-muted mt-1">
                          {totalVotes} votes
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-conclave-muted">
                      <span>
                        {new Date(p.deadline * 1000).toLocaleString()}
                      </span>
                      {!deadlinePassed && (
                        <span className="text-conclave-accent font-medium">
                          {formatTimeLeft(p.deadline)}
                        </span>
                      )}
                      {deadlinePassed && !p.isFinalized && (
                        <span className="text-yellow-400 font-medium">
                          Awaiting reveals
                        </span>
                      )}
                      {p.isFinalized && totalVotes > 0 && (
                        <span
                          className={`font-bold ${p.voteYesCount > p.voteNoCount
                              ? "text-green-400"
                              : p.voteNoCount > p.voteYesCount
                                ? "text-red-400"
                                : "text-yellow-400"
                            }`}
                        >
                          {p.voteYesCount > p.voteNoCount
                            ? "PASSED"
                            : p.voteNoCount > p.voteYesCount
                              ? "REJECTED"
                              : "TIED"}
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
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
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
    return () => {
      cancelled = true;
    };
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
          ),
        );
      }

      // Transfer 1 token
      tx.add(createTransferInstruction(creatorAta, inviteeAta, wallet, 1));

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet;

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setStatus({
        type: "success",
        message: `Sent 1 token to ${inviteePubkey.toBase58().slice(0, 8)}...`,
      });
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
        <p
          className={`text-sm mt-2 ${status.type === "success" ? "text-green-400" : "text-red-400"
            }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
