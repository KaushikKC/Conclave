"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchRooms, ApiRoom } from "../../lib/api";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";

interface RoomItem {
  publicKey: string;
  name: string;
  authority: string;
  governanceMint: string;
  memberCount: number;
  proposalCount: number;
  createdAt: number;
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
  };
}

export default function RoomsListPage() {
  const { programReadOnly } = useConclaveProgram();
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!programReadOnly) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRooms();
        if (cancelled) return;
        setRooms(data.map(mapApiRoom));
      } catch {
        try {
          const accounts = await (programReadOnly.account as any).daoRoom.all();
          if (cancelled) return;
          setRooms(
            accounts.map((acc: any) => ({
              publicKey: acc.publicKey.toBase58(),
              name: acc.account.name,
              authority: acc.account.authority.toBase58(),
              governanceMint: acc.account.governanceMint.toBase58(),
              memberCount: acc.account.memberCount ?? 0,
              proposalCount: acc.account.proposalCount ?? 0,
              createdAt: Number(acc.account.createdAt ?? 0),
            })),
          );
          if (cancelled) return;
          setError("");
        } catch (e: any) {
          if (!cancelled) setError(e?.message || "Failed to load rooms");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programReadOnly]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Rooms</h1>
        <Link href="/rooms/create" className="btn-primary">
          Create room
        </Link>
      </div>

      {loading && <p className="text-conclave-muted">Loading rooms…</p>}
      {error && <p className="text-red-400 mb-4">{error}</p>}
      {!loading && !error && rooms.length === 0 && (
        <div className="card text-center text-conclave-muted">
          <p className="mb-4">No rooms yet.</p>
          <Link href="/rooms/create" className="btn-primary inline-block">
            Create the first room
          </Link>
        </div>
      )}
      {!loading && rooms.length > 0 && (
        <ul className="space-y-3">
          {rooms.map((room) => (
            <li key={room.publicKey}>
              <Link
                href={`/rooms/${room.publicKey}`}
                className="card block hover:border-conclave-accent/50 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-white">{room.name}</h2>
                    <p className="text-sm text-conclave-muted mt-1">
                      {room.memberCount} members · {room.proposalCount}{" "}
                      proposals
                    </p>
                    <p className="text-xs text-conclave-muted mt-1 font-mono truncate max-w-md">
                      Mint: {room.governanceMint}
                    </p>
                  </div>
                  <span className="text-conclave-accent text-sm">Open →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
