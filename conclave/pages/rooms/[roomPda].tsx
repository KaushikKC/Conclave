"use client";

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";
import { getRoomPda, getMemberPda } from "../../lib/conclave";
import ChatRoom from "../../components/ChatRoom";
import MemberList from "../../components/MemberList";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

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
  const { program, programReadOnly } = useConclaveProgram();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [encryptedKeyHex, setEncryptedKeyHex] = useState("");
  const [tab, setTab] = useState<Tab>("chat");
  const [groupKey, setGroupKey] = useState<Uint8Array | null>(null);

  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;

  useEffect(() => {
    if (!programReadOnly || !roomPda) return;
    let cancelled = false;
    (async () => {
      try {
        const pubkey = new PublicKey(roomPda);
        const acc = await (programReadOnly.account as any).daoRoom.fetch(
          pubkey,
        );
        if (cancelled) return;
        setRoom({
          name: acc.name,
          authority: acc.authority.toBase58(),
          governanceMint: acc.governanceMint.toBase58(),
          memberCount: acc.memberCount ?? 0,
          proposalCount: acc.proposalCount ?? 0,
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
  }, [programReadOnly, roomPda]);

  useEffect(() => {
    if (!programReadOnly || !roomPda || !wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const roomPubkey = new PublicKey(roomPda);
        const memberPda = getMemberPda(
          roomPubkey,
          wallet,
          programReadOnly.programId,
        );
        await (programReadOnly.account as any).member.fetch(memberPda);
        if (!cancelled) setIsMember(true);
      } catch {
        if (!cancelled) setIsMember(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programReadOnly, roomPda, wallet]);

  useEffect(() => {
    if (!roomPda) return;
    try {
      const raw = localStorage.getItem(GROUP_KEY_STORAGE_PREFIX + roomPda);
      if (raw) {
        const arr = JSON.parse(raw) as number[];
        setGroupKey(new Uint8Array(arr));
      }
    } catch {
      setGroupKey(null);
    }
  }, [roomPda]);

  const handleJoin = async () => {
    if (!program || !wallet || !roomPda || !room) return;
    let encryptedKeyBytes: number[];
    try {
      if (encryptedKeyHex.trim()) {
        const hex = encryptedKeyHex.trim().replace(/^0x/, "");
        encryptedKeyBytes = Array.from(Buffer.from(hex, "hex"));
      } else {
        encryptedKeyBytes = Array(64).fill(0);
      }
    } catch {
      setJoinError("Invalid encrypted key (use hex).");
      return;
    }

    setJoinLoading(true);
    setJoinError("");
    try {
      const roomPubkey = new PublicKey(roomPda);
      const memberPda = getMemberPda(roomPubkey, wallet, program.programId);
      const governanceMint = new PublicKey(room.governanceMint);
      const tokenAccount = getAssociatedTokenAddressSync(
        governanceMint,
        wallet,
      );

      await program.methods
        .joinRoom(encryptedKeyBytes)
        .accountsPartial({
          wallet,
          room: roomPubkey,
          tokenAccount,
          member: memberPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setIsMember(true);
      setEncryptedKeyHex("");
    } catch (err: any) {
      setJoinError(err?.message || "Join failed");
    } finally {
      setJoinLoading(false);
    }
  };

  const saveGroupKeyFromInput = () => {
    if (!roomPda || !encryptedKeyHex.trim()) return;
    try {
      const hex = encryptedKeyHex.trim().replace(/^0x/, "");
      const arr = Array.from(Buffer.from(hex, "hex"));
      localStorage.setItem(
        GROUP_KEY_STORAGE_PREFIX + roomPda,
        JSON.stringify(arr),
      );
      setGroupKey(new Uint8Array(arr));
    } catch {
      setJoinError("Invalid hex for group key.");
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

          <p className="text-sm text-gray-300 mb-2">
            You need at least 1 governance token to join. If the room creator
            sent you an encrypted group key, paste it below (hex).
          </p>
          <input
            type="text"
            value={encryptedKeyHex}
            onChange={(e) => setEncryptedKeyHex(e.target.value)}
            placeholder="Optional: encrypted group key (hex)"
            className="w-full rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none font-mono text-sm mb-3"
          />
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
          {!groupKey && (
            <div className="mb-4 p-3 rounded-lg bg-conclave-dark/50 text-sm text-conclave-muted">
              Messages are encrypted. Paste the room group key (hex) from the
              creator and click Save to decrypt.
              <input
                type="text"
                value={encryptedKeyHex}
                onChange={(e) => setEncryptedKeyHex(e.target.value)}
                placeholder="Group key (hex)"
                className="mt-2 w-full rounded border border-conclave-border bg-conclave-dark px-2 py-1 font-mono text-xs"
              />
              <button
                type="button"
                onClick={saveGroupKeyFromInput}
                className="btn-secondary mt-2 text-xs"
              >
                Save key
              </button>
            </div>
          )}
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
          <ProposalsList roomPda={roomPubkey} />
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

function ProposalsList({ roomPda }: { roomPda: PublicKey }) {
  const { programReadOnly } = useConclaveProgram();
  const [list, setList] = useState<
    {
      publicKey: string;
      title: string;
      deadline: number;
      isFinalized: boolean;
    }[]
  >([]);

  useEffect(() => {
    if (!programReadOnly) return;
    (async () => {
      try {
        const accounts = await (programReadOnly.account as any).proposal.all();
        const filtered = accounts.filter(
          (acc: any) => acc.account.room.toBase58() === roomPda.toBase58(),
        );
        setList(
          filtered.map((acc: any) => ({
            publicKey: acc.publicKey.toBase58(),
            title: acc.account.title,
            deadline: Number(acc.account.deadline),
            isFinalized: acc.account.isFinalized ?? false,
          })),
        );
      } catch {
        setList([]);
      }
    })();
  }, [programReadOnly, roomPda]);

  if (list.length === 0) {
    return <p className="text-conclave-muted text-sm">No proposals yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {list.map((p) => (
        <li key={p.publicKey}>
          <Link
            href={`/rooms/${roomPda.toBase58()}/proposals/${p.publicKey}`}
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
