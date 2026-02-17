"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { fetchRoomMembers } from "../lib/api";
import { getAnonAlias } from "../lib/anon";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConclaveProgram } from "../hooks/useConclaveProgram";

interface MemberItem {
  wallet: string;
  joinedAt: number;
}

interface MemberListProps {
  roomPda: PublicKey;
}

export default function MemberList({ roomPda }: MemberListProps) {
  const { publicKey: myWallet } = useWallet();
  const { programReadOnly } = useConclaveProgram();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomPda) return;
    let cancelled = false;
    (async () => {
      // Try indexer first
      try {
        const data = await fetchRoomMembers(roomPda.toBase58());
        if (!cancelled && data.length > 0) {
          setMembers(data.map((m) => ({ wallet: m.wallet, joinedAt: m.joined_at })));
          setLoading(false);
          return;
        }
      } catch {}

      // Fallback: fetch member accounts from chain via getProgramAccounts
      if (programReadOnly && !cancelled) {
        try {
          const allMembers = await (programReadOnly.account as any).member.all([
            { memcmp: { offset: 40, bytes: roomPda.toBase58() } },
          ]);
          if (!cancelled) {
            setMembers(
              allMembers.map((m: any) => ({
                wallet: m.account.wallet.toBase58(),
                joinedAt: m.account.joinedAt.toNumber(),
              })),
            );
          }
        } catch {
          if (!cancelled) setMembers([]);
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roomPda, programReadOnly]);

  const roomAddr = roomPda.toBase58();

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
          {members.map((m) => {
            const isMe = myWallet && m.wallet === myWallet.toBase58();
            const alias = getAnonAlias(m.wallet, roomAddr);
            return (
              <li
                key={m.wallet}
                className="flex items-center justify-between text-sm py-1 border-b border-conclave-border/50"
              >
                <span className="font-medium text-gray-300">
                  {alias}{isMe ? " (you)" : ""}
                </span>
                <span className="text-conclave-muted text-xs">
                  Joined {new Date(m.joinedAt * 1000).toLocaleDateString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
