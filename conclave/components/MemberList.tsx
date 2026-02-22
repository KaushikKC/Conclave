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
  gold: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
};

const TIER_LABELS: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
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
      } catch { }

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
    <div className="animate-fadeIn">
      {loading && (
        <div className="flex justify-center py-8">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-conclave-yellow animate-bounce"></div>
            <div className="w-2 h-2 rounded-full bg-conclave-yellow animate-bounce" style={{ animationDelay: "0.2s" }}></div>
            <div className="w-2 h-2 rounded-full bg-conclave-yellow animate-bounce" style={{ animationDelay: "0.4s" }}></div>
          </div>
        </div>
      )}

      {!loading && members.length === 0 && (
        <div className="text-center py-8 bg-black/40 rounded-2xl border border-white/5">
          <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted">No members yet.</p>
        </div>
      )}

      {!loading && members.length > 0 && (
        <div className="bg-black/40 rounded-3xl border border-white/5 p-6 backdrop-blur-xl shadow-inner scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent max-h-[400px] overflow-y-auto">
          <ul className="space-y-4">
            {members.map((m) => {
              const isMe = myWallet && m.wallet === myWallet.toBase58();
              const alias = getAnonAlias(m.wallet, roomAddr);
              const rep = reputations[m.wallet];
              return (
                <li
                  key={m.wallet}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-conclave-yellow/30 hover:bg-conclave-yellow/5 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-conclave-yellow/20 to-black border border-conclave-yellow/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(255,200,0,0.1)] group-hover:shadow-[0_0_20px_rgba(255,200,0,0.3)] transition-all">
                      <span className="text-conclave-yellow text-xs font-black uppercase">{alias.charAt(0)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white group-hover:text-conclave-yellow transition-colors">
                        {alias}
                        {isMe && <span className="text-[9px] px-2 py-0.5 rounded-full bg-conclave-pink/10 text-conclave-pink border border-conclave-pink/20">(You)</span>}
                        <ReputationBadge rep={rep} />
                      </span>
                      <span className="text-[9px] text-conclave-textMuted font-mono w-24 truncate mt-1 opactiy-60" title={m.wallet}>
                        {m.wallet.slice(0, 4)}...{m.wallet.slice(-4)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted/60 sm:text-right">
                    Joined<br className="hidden sm:block" /> {new Date(m.joinedAt * 1000).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 pt-6 border-t border-white/5 flex flex-wrap justify-center gap-4 text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted">
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Bronze (1–4)</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Silver (5–9)</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]"></span> Gold (10+)</div>
          </div>
        </div>
      )}
    </div>
  );
}
