"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { fetchRoomMembers } from "../lib/api";

interface MemberItem {
  wallet: string;
  joinedAt: number;
}

interface MemberListProps {
  roomPda: PublicKey;
}

export default function MemberList({ roomPda }: MemberListProps) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomPda) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRoomMembers(roomPda.toBase58());
        if (cancelled) return;
        setMembers(
          data.map((m) => ({
            wallet: m.wallet,
            joinedAt: m.joined_at,
          })),
        );
      } catch {
        setMembers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomPda]);

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  return (
    <div>
      {loading && (
        <p className="text-conclave-muted text-sm">Loading members…</p>
      )}
      {!loading && members.length === 0 && (
        <p className="text-conclave-muted text-sm">No members yet.</p>
      )}
      {!loading && members.length > 0 && (
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.wallet}
              className="flex items-center justify-between text-sm py-1 border-b border-conclave-border/50"
            >
              <span className="font-mono text-gray-300">{short(m.wallet)}</span>
              <span className="text-conclave-muted text-xs">
                {new Date(m.joinedAt * 1000).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
