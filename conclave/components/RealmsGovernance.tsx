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
      <p className="text-conclave-muted text-sm py-4">
        Loading Realms data...
      </p>
    );
  }

  if (error || !realmInfo) {
    return (
      <div className="space-y-4 py-2">
        <div className="rounded-lg border border-conclave-border bg-conclave-dark/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
                Realms DAO
              </span>
              <span className="text-white font-medium text-sm font-mono truncate max-w-xs">
                {realmAddress}
              </span>
            </div>
          </div>
          {error && <p className="text-yellow-400 text-xs mb-3">{error}</p>}
          <p className="text-conclave-muted text-sm mb-3">
            Could not fetch live data from the Realm. This can happen due to RPC rate limits.
          </p>
          <a
            href={`https://app.realms.today/dao/${realmAddress}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition"
          >
            View on Realms &rarr;
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Realm overview */}
      <div className="rounded-lg border border-conclave-border bg-conclave-dark/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
              Realms DAO
            </span>
            <span className="text-white font-semibold">
              {realmInfo.name}
            </span>
          </div>
          <a
            href={`https://app.realms.today/dao/${realmAddress}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-conclave-accent hover:underline"
          >
            Open in Realms &rarr;
          </a>
        </div>

        <div className="grid grid-cols-2 gap-4 text-center mb-4">
          <div>
            <p className="text-lg font-bold text-white">
              {realmInfo.votingProposalCount}
            </p>
            <p className="text-xs text-conclave-muted">Active Votes</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">
              {realmInfo.councilMint ? "Yes" : "No"}
            </p>
            <p className="text-xs text-conclave-muted">Council</p>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-conclave-muted">Community Mint</span>
            <span className="text-white font-mono truncate max-w-[200px]">
              {realmInfo.communityMint.toBase58()}
            </span>
          </div>
          {realmInfo.councilMint && (
            <div className="flex justify-between">
              <span className="text-conclave-muted">Council Mint</span>
              <span className="text-white font-mono truncate max-w-[200px]">
                {realmInfo.councilMint.toBase58()}
              </span>
            </div>
          )}
          {realmInfo.authority && (
            <div className="flex justify-between">
              <span className="text-conclave-muted">Authority</span>
              <span className="text-white font-mono truncate max-w-[200px]">
                {realmInfo.authority.toBase58()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-lg border border-conclave-border bg-conclave-dark/50 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Governance</h3>
        <p className="text-conclave-muted text-sm mb-4">
          Use Conclave to discuss and vote on governance proposals anonymously.
          View the full DAO dashboard on Realms.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`https://app.realms.today/dao/${realmAddress}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition"
          >
            DAO Dashboard
          </a>
          <a
            href={`https://app.realms.today/dao/${realmAddress}/members?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm px-4 py-2 rounded-lg border border-conclave-border text-conclave-muted hover:text-white transition"
          >
            Members
          </a>
          <a
            href={`https://app.realms.today/dao/${realmAddress}/treasury?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm px-4 py-2 rounded-lg border border-conclave-border text-conclave-muted hover:text-white transition"
          >
            Treasury
          </a>
        </div>
      </div>
    </div>
  );
}
