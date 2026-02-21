"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { fetchRoomMembers, fetchReputationBatch, ApiReputation } from "../lib/api";
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

const TIER_STYLES: Record<string, string> = {
  bronze: "bg-amber-700/20 text-amber-500 border-amber-700/40",
  silver: "bg-gray-400/20 text-gray-300 border-gray-400/40",
  gold:   "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
};

const TIER_LABELS: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold:   "Gold",
};

function ReputationBadge({ rep }: { rep: ApiReputation | undefined }) {
  if (!rep || rep.tier === "none") return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${TIER_STYLES[rep.tier]}`}
      title={`${TIER_LABELS[rep.tier]} — ${rep.votes_cast}v · ${rep.proposals_created}p · ${rep.messages_sent}m`}
    >
      ◆ {TIER_LABELS[rep.tier]}
    </span>
  );
}

export default function MemberList({ roomPda }: MemberListProps) {
  const { publicKey: myWallet } = useWallet();
  const { programReadOnly } = useConclaveProgram();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [reputations, setReputations] = useState<Record<string, ApiReputation>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomPda) return;
    let cancelled = false;
    (async () => {
      // Try indexer first
      try {
        const data = await fetchRoomMembers(roomPda.toBase58());
        if (!cancelled && data.length > 0) {
          const list = data.map((m) => ({ wallet: m.wallet, joinedAt: m.joined_at }));
          setMembers(list);
          setLoading(false);
          // Fetch reputation for all members in one batch
          const wallets = list.map((m) => m.wallet);
          fetchReputationBatch(wallets).then((batch) => {
            if (!cancelled) setReputations(batch);
          });
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
            const list = allMembers.map((m: any) => ({
              wallet: m.account.wallet.toBase58(),
              joinedAt: m.account.joinedAt.toNumber(),
            }));
            setMembers(list);
            const wallets = list.map((m: any) => m.wallet);
            fetchReputationBatch(wallets).then((batch) => {
              if (!cancelled) setReputations(batch);
            });
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
            const rep = reputations[m.wallet];
            return (
              <li
                key={m.wallet}
                className="flex items-center justify-between text-sm py-1 border-b border-conclave-border/50"
              >
                <span className="flex items-center gap-1.5 font-medium text-gray-300">
                  {alias}{isMe ? " (you)" : ""}
                  <ReputationBadge rep={rep} />
                </span>
                <span className="text-conclave-muted text-xs">
                  Joined {new Date(m.joinedAt * 1000).toLocaleDateString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && members.length > 0 && (
        <p className="text-[10px] text-conclave-muted mt-3 border-t border-conclave-border/30 pt-2">
          Badges: ◆ Bronze (1–4 actions) · ◆ Silver (5–9) · ◆ Gold (10+) — scores are anonymous
        </p>
      )}
    </div>
  );
}
