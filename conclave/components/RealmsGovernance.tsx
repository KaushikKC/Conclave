"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { fetchRealmInfo, type RealmInfo } from "../app/sdk/realms";

interface Props {
  realmAddress: string;
}

export default function RealmsGovernance({ realmAddress }: Props) {
  const { connection } = useConnection();
  const [realmInfo, setRealmInfo] = useState<RealmInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const realmPubkey = new PublicKey(realmAddress);
        const info = await fetchRealmInfo(connection, realmPubkey);
        if (cancelled) return;
        setRealmInfo(info);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load Realm info");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [realmAddress, connection]);

  if (loading) {
    return (
      <div className="flex justify-center py-8 animate-fadeIn">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"></div>
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "0.2s" }}></div>
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "0.4s" }}></div>
        </div>
      </div>
    );
  }

  if (error || !realmInfo) {
    return (
      <div className="space-y-4 py-2 animate-fadeIn">
        <div className="rounded-3xl border border-white/5 bg-black/40 p-6 backdrop-blur-xl shadow-inner relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full mix-blend-screen filter blur-[40px] z-0 pointer-events-none"></div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                  Realms DAO
                </span>
                <span className="text-white font-mono text-sm max-w-[150px] sm:max-w-xs truncate opacity-70">
                  {realmAddress}
                </span>
              </div>
            </div>

            {error && <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-yellow mb-4 p-3 bg-conclave-yellow/10 rounded-xl border border-conclave-yellow/20 inline-block">{error}</p>}

            <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed mb-6">
              Could not fetch live data from the Realm. This can happen due to RPC rate limits.
            </p>

            <a
              href={`https://app.realms.today/dao/${realmAddress}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600/80 to-purple-400/80 hover:from-purple-500 hover:to-purple-300 text-white shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all"
            >
              View on Realms &rarr;
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Realm overview */}
      <div className="rounded-3xl border border-white/5 bg-black/40 p-6 sm:p-8 backdrop-blur-xl shadow-inner relative overflow-hidden group hover:border-purple-500/20 transition-all">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full mix-blend-screen filter blur-[50px] z-0 pointer-events-none group-hover:bg-purple-500/20 transition-all duration-500"></div>

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/5">
            <div className="flex items-center gap-3">
              <span className="text-[10px] px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                Realms DAO
              </span>
              <span className="text-xl font-black text-white uppercase tracking-widest truncate max-w-[200px] sm:max-w-xs">
                {realmInfo.name}
              </span>
            </div>
            <a
              href={`https://app.realms.today/dao/${realmAddress}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-white transition-colors flex items-center gap-1"
            >
              Open in Realms &nearr;
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center mb-8">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 shadow-inner flex flex-col items-center justify-center">
              <p className="text-3xl font-black text-white mb-1 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                {realmInfo.votingProposalCount}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-conclave-textMuted">Active Votes</p>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 shadow-inner flex flex-col items-center justify-center">
              <p className={`text-3xl font-black mb-1 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] ${realmInfo.councilMint ? 'text-green-400' : 'text-conclave-textMuted'}`}>
                {realmInfo.councilMint ? "Yes" : "No"}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-conclave-textMuted">Council</p>
            </div>
          </div>

          <div className="space-y-3 bg-black/40 p-5 rounded-2xl border border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted">Community Mint</span>
              <span className="text-xs text-white font-mono bg-white/5 px-2 py-1 rounded truncate max-w-full sm:max-w-[200px]" title={realmInfo.communityMint.toBase58()}>
                {realmInfo.communityMint.toBase58()}
              </span>
            </div>
            {realmInfo.councilMint && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-3 border-t border-white/5">
                <span className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted">Council Mint</span>
                <span className="text-xs text-white font-mono bg-white/5 px-2 py-1 rounded truncate max-w-full sm:max-w-[200px]" title={realmInfo.councilMint.toBase58()}>
                  {realmInfo.councilMint.toBase58()}
                </span>
              </div>
            )}
            {realmInfo.authority && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-3 border-t border-white/5">
                <span className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted">Authority</span>
                <span className="text-xs text-white font-mono bg-white/5 px-2 py-1 rounded truncate max-w-full sm:max-w-[200px]" title={realmInfo.authority.toBase58()}>
                  {realmInfo.authority.toBase58()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-3xl border border-white/5 bg-black/40 p-6 sm:p-8 backdrop-blur-xl shadow-inner">
        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.8)]"></span>
          Governance
        </h3>
        <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed mb-6 max-w-md">
          Use the workspace to discuss and privately vote on governance proposals.
          View the complete DAO dashboard on Realms.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`https://app.realms.today/dao/${realmAddress}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none text-center text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.1)] transition-all"
          >
            Dashboard
          </a>
          <a
            href={`https://app.realms.today/dao/${realmAddress}/members${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none text-center text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl bg-black/50 text-conclave-textMuted border border-white/10 hover:text-white hover:border-white/20 transition-all"
          >
            Members
          </a>
          <a
            href={`https://app.realms.today/dao/${realmAddress}/treasury${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none text-center text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl bg-black/50 text-conclave-textMuted border border-white/10 hover:text-white hover:border-white/20 transition-all"
          >
            Treasury
          </a>
        </div>
      </div>
    </div>
  );
}
