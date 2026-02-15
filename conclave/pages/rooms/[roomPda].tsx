"use client";

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";
import { getMemberPda } from "../../lib/conclave";
import ChatRoom from "../../components/ChatRoom";
import MemberList from "../../components/MemberList";
import {
  fetchRoom,
  fetchRoomMembers,
  fetchRoomProposals,
  fetchGroupKey as fetchGroupKeyFromApi,
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
  const { program } = useConclaveProgram();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [tab, setTab] = useState<Tab>("chat");
  const [groupKey, setGroupKey] = useState<Uint8Array | null>(null);

  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;

  // Fetch room data from indexer
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
        if (!cancelled) setRoom(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomPda]);

  // Check membership from indexer
  useEffect(() => {
    if (!roomPda || !wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const members = await fetchRoomMembers(roomPda);
        const found = members.some((m) => m.wallet === wallet.toBase58());
        if (!cancelled) setIsMember(found);
      } catch {
        if (!cancelled) setIsMember(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomPda, wallet]);

  // Load group key from localStorage, or fetch from indexer
  useEffect(() => {
    if (!roomPda) return;
    (async () => {
      // Try localStorage first
      try {
        const raw = localStorage.getItem(GROUP_KEY_STORAGE_PREFIX + roomPda);
        if (raw) {
          const arr = JSON.parse(raw) as number[];
          setGroupKey(new Uint8Array(arr));
          return;
        }
      } catch {}

      // Fetch from indexer
      try {
        const keyBase64 = await fetchGroupKeyFromApi(roomPda);
        if (keyBase64) {
          const arr = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
          localStorage.setItem(
            GROUP_KEY_STORAGE_PREFIX + roomPda,
            JSON.stringify(Array.from(arr)),
          );
          setGroupKey(arr);
        }
      } catch {}
    })();
  }, [roomPda]);

  const handleJoin = async () => {
    if (!program || !wallet || !roomPda || !room) return;

    setJoinLoading(true);
    setJoinError("");
    try {
      // Fetch group key from indexer
      let keyBytes: Uint8Array;
      const keyBase64 = await fetchGroupKeyFromApi(roomPda);
      if (keyBase64) {
        keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
      } else {
        // Fallback: zero key (shouldn't happen if room was created properly)
        keyBytes = new Uint8Array(32);
      }

      const roomPubkey = new PublicKey(roomPda);
      const memberPda = getMemberPda(roomPubkey, wallet, program.programId);
      const governanceMint = new PublicKey(room.governanceMint);
      const tokenAccount = getAssociatedTokenAddressSync(
        governanceMint,
        wallet,
      );

      await program.methods
        .joinRoom(Array.from(keyBytes))
        .accountsPartial({
          wallet,
          room: roomPubkey,
          tokenAccount,
          member: memberPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Store group key locally
      localStorage.setItem(
        GROUP_KEY_STORAGE_PREFIX + roomPda,
        JSON.stringify(Array.from(keyBytes)),
      );
      setGroupKey(keyBytes);
      setIsMember(true);
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/rooms"
        className="text-conclave-accent text-sm mb-4 inline-block"
      >
        ← Rooms
      </Link>
      <h1 className="text-2xl font-bold text-white mb-6">{room.name}</h1>

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
