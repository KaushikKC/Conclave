"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchRooms, fetchMyRooms, ApiRoom } from "../../lib/api";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";

interface RoomItem {
  publicKey: string;
  name: string;
  authority: string;
  governanceMint: string;
  memberCount: number;
  proposalCount: number;
  createdAt: number;
  realmAddress: string | null;
}

function mapApiRoom(r: ApiRoom): RoomItem {
  return {
    publicKey: r.address,
    name: r.name,
    authority: r.authority,
    governanceMint: r.governance_mint,
    memberCount: r.member_count,
    proposalCount: r.proposal_count,
    createdAt: r.created_at,
    realmAddress: r.realm_address || null,
  };
}

type RoomTab = "my" | "all";

export default function RoomsListPage() {
  const { programReadOnly } = useConclaveProgram();
  const { publicKey: wallet, connected } = useWallet();
  const [allRooms, setAllRooms] = useState<RoomItem[]>([]);
  const [myRooms, setMyRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<RoomTab>("all");

  // Switch to "my" tab when wallet connects
  useEffect(() => {
    if (connected) setTab("my");
  }, [connected]);

  // Fetch all rooms from indexer (no dependency on programReadOnly)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRooms();
        if (cancelled) return;
        setAllRooms(data.map(mapApiRoom));
      } catch {
        // Fallback to on-chain if indexer is down and program is ready
        if (programReadOnly) {
          try {
            const accounts = await (programReadOnly.account as any).daoRoom.all();
            if (cancelled) return;
            setAllRooms(
              accounts.map((acc: any) => ({
                publicKey: acc.publicKey.toBase58(),
                name: acc.account.name,
                authority: acc.account.authority.toBase58(),
                governanceMint: acc.account.governanceMint.toBase58(),
                memberCount: acc.account.memberCount ?? 0,
                proposalCount: acc.account.proposalCount ?? 0,
                createdAt: Number(acc.account.createdAt ?? 0),
                realmAddress: null,
              })),
            );
          } catch (e: any) {
            if (!cancelled) setError(e?.message || "Failed to load rooms");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programReadOnly]);

  // Fetch my rooms
  useEffect(() => {
    if (!wallet) {
      setMyRooms([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMyRooms(wallet.toBase58());
        if (!cancelled) setMyRooms(data.map(mapApiRoom));
      } catch {
        // Non-fatal — just show empty
        if (!cancelled) setMyRooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const displayRooms = tab === "my" ? myRooms : allRooms;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Rooms</h1>
        <Link href="/rooms/create" className="btn-primary">
          Create room
        </Link>
      </div>

      {/* Tabs */}
      {connected && (
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("my")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === "my"
                ? "bg-conclave-accent/20 border border-conclave-accent text-conclave-accent"
                : "border border-conclave-border text-conclave-muted hover:text-white"
            }`}
          >
            My Rooms ({myRooms.length})
          </button>
          <button
            onClick={() => setTab("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === "all"
                ? "bg-conclave-accent/20 border border-conclave-accent text-conclave-accent"
                : "border border-conclave-border text-conclave-muted hover:text-white"
            }`}
          >
            All Rooms ({allRooms.length})
          </button>
        </div>
      )}

      {loading && <p className="text-conclave-muted">Loading rooms...</p>}
      {error && <p className="text-red-400 mb-4">{error}</p>}

      {!loading && displayRooms.length === 0 && (
        <div className="card text-center text-conclave-muted">
          {tab === "my" ? (
            <>
              <p className="mb-4">You haven't joined any rooms yet.</p>
              <button
                onClick={() => setTab("all")}
                className="btn-secondary inline-block mr-3"
              >
                Browse all rooms
              </button>
              <Link href="/rooms/create" className="btn-primary inline-block">
                Create a room
              </Link>
            </>
          ) : (
            <>
              <p className="mb-4">No rooms yet.</p>
              <Link href="/rooms/create" className="btn-primary inline-block">
                Create the first room
              </Link>
            </>
          )}
        </div>
      )}

      {!loading && displayRooms.length > 0 && (
        <ul className="space-y-3">
          {displayRooms.map((room) => (
            <li key={room.publicKey}>
              <Link
                href={`/rooms/${room.publicKey}`}
                className="card block hover:border-conclave-accent/50 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-white">{room.name}</h2>
                      {room.realmAddress && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
                          Realms
                        </span>
                      )}
                      {tab === "my" && wallet && room.authority === wallet.toBase58() && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-conclave-accent/20 text-conclave-accent border border-conclave-accent/30 font-medium">
                          Creator
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-conclave-muted mt-1">
                      {room.memberCount} members · {room.proposalCount}{" "}
                      proposals
                    </p>
                    <p className="text-xs text-conclave-muted mt-1 font-mono truncate max-w-md">
                      Mint: {room.governanceMint}
                    </p>
                  </div>
                  <span className="text-conclave-accent text-sm">Open &rarr;</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
