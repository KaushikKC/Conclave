"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  fetchRealmsProposals,
  fetchRealmsGovernances,
  fetchRealmInfo,
  ProposalState,
  type RealmsProposalInfo,
  type RealmsGovernanceInfo,
  type RealmInfo,
} from "../app/sdk/realms";

function proposalStateLabel(state: ProposalState): {
  label: string;
  color: string;
} {
  switch (state) {
    case ProposalState.Draft:
      return { label: "Draft", color: "text-gray-400" };
    case ProposalState.SigningOff:
      return { label: "Signing Off", color: "text-yellow-400" };
    case ProposalState.Voting:
      return { label: "Voting", color: "text-green-400" };
    case ProposalState.Succeeded:
      return { label: "Succeeded", color: "text-blue-400" };
    case ProposalState.Executing:
      return { label: "Executing", color: "text-purple-400" };
    case ProposalState.Completed:
      return { label: "Completed", color: "text-conclave-muted" };
    case ProposalState.Cancelled:
      return { label: "Cancelled", color: "text-red-400" };
    case ProposalState.Defeated:
      return { label: "Defeated", color: "text-red-400" };
    case ProposalState.ExecutingWithErrors:
      return { label: "Exec Error", color: "text-red-400" };
    case ProposalState.Vetoed:
      return { label: "Vetoed", color: "text-red-400" };
    default:
      return { label: "Unknown", color: "text-gray-400" };
  }
}

interface Props {
  realmAddress: string;
}

export default function RealmsGovernance({ realmAddress }: Props) {
  const { connection } = useConnection();
  const [realmInfo, setRealmInfo] = useState<RealmInfo | null>(null);
  const [proposals, setProposals] = useState<RealmsProposalInfo[]>([]);
  const [governances, setGovernances] = useState<RealmsGovernanceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const realmPubkey = new PublicKey(realmAddress);
        const [info, govs, props] = await Promise.all([
          fetchRealmInfo(connection, realmPubkey),
          fetchRealmsGovernances(connection, realmPubkey),
          fetchRealmsProposals(connection, realmPubkey),
        ]);
        if (cancelled) return;
        setRealmInfo(info);
        setGovernances(govs);
        setProposals(props);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load Realms data");
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
        Loading Realms governance data...
      </p>
    );
  }

  if (error) {
    return <p className="text-red-400 text-sm py-4">{error}</p>;
  }

  const activeProposals = proposals.filter(
    (p) => p.state === ProposalState.Voting
  );
  const otherProposals = proposals.filter(
    (p) => p.state !== ProposalState.Voting
  );

  return (
    <div className="space-y-6">
      {/* Realm overview */}
      {realmInfo && (
        <div className="rounded-lg border border-conclave-border bg-conclave-dark/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
                Realms DAO
              </span>
              <span className="text-white font-semibold">
                {realmInfo.name}
              </span>
            </div>
            <a
              href={`https://app.realms.today/dao/${realmAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-conclave-accent hover:underline"
            >
              Open in Realms &rarr;
            </a>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-bold text-white">
                {governances.length}
              </p>
              <p className="text-xs text-conclave-muted">Governances</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                {proposals.length}
              </p>
              <p className="text-xs text-conclave-muted">Proposals</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                {activeProposals.length}
              </p>
              <p className="text-xs text-conclave-muted">Active Votes</p>
            </div>
          </div>
        </div>
      )}

      {/* Active proposals */}
      {activeProposals.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">
            Active Votes
          </h3>
          <ul className="space-y-2">
            {activeProposals.map((p) => (
              <ProposalCard
                key={p.pubkey.toBase58()}
                proposal={p}
                realmAddress={realmAddress}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Past proposals */}
      {otherProposals.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-conclave-muted uppercase tracking-wider mb-3">
            Past Proposals ({otherProposals.length})
          </h3>
          <ul className="space-y-2">
            {otherProposals.slice(0, 10).map((p) => (
              <ProposalCard
                key={p.pubkey.toBase58()}
                proposal={p}
                realmAddress={realmAddress}
              />
            ))}
            {otherProposals.length > 10 && (
              <li className="text-center py-2">
                <a
                  href={`https://app.realms.today/dao/${realmAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-conclave-accent hover:underline"
                >
                  View all {otherProposals.length} proposals on Realms &rarr;
                </a>
              </li>
            )}
          </ul>
        </div>
      )}

      {proposals.length === 0 && (
        <p className="text-conclave-muted text-sm">
          No proposals found in this Realm.
        </p>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  realmAddress,
}: {
  proposal: RealmsProposalInfo;
  realmAddress: string;
}) {
  const { label, color } = proposalStateLabel(proposal.state);
  const totalVotes = proposal.yesVotes + proposal.noVotes;
  const yesPercent =
    totalVotes > 0 ? Math.round((proposal.yesVotes / totalVotes) * 100) : 0;

  return (
    <li className="rounded-lg border border-conclave-border/50 p-3 hover:border-conclave-border transition">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <a
            href={`https://app.realms.today/dao/${realmAddress}/proposal/${proposal.pubkey.toBase58()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-white hover:text-conclave-accent transition truncate block"
          >
            {proposal.name}
          </a>
          {proposal.votingAt && (
            <p className="text-xs text-conclave-muted mt-1">
              Voting started{" "}
              {new Date(proposal.votingAt * 1000).toLocaleDateString()}
            </p>
          )}
        </div>
        <span className={`text-xs font-medium ${color} whitespace-nowrap`}>
          {label}
        </span>
      </div>
      {totalVotes > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-2 text-xs text-conclave-muted">
            <span className="text-green-400">Yes {yesPercent}%</span>
            <span>&middot;</span>
            <span className="text-red-400">No {100 - yesPercent}%</span>
            <span>&middot;</span>
            <span>{totalVotes.toLocaleString()} votes</span>
          </div>
          <div className="mt-1 h-1.5 bg-conclave-dark rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${yesPercent}%` }}
            />
          </div>
        </div>
      )}
    </li>
  );
}
