"use client";

import { useRouter } from "next/router";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useConclaveProgram } from "../../../../hooks/useConclaveProgram";
import { getMemberPda, getVoteCommitmentPda } from "../../../../lib/conclave";
import { createVoteCommitment } from "../../../../app/sdk/crypto";
import { fetchProposal, fetchProposalVotes, fetchRoom, notifyIndexer, storeVoteData, fetchVoteData } from "../../../../lib/api";
import { getAnonAlias } from "../../../../lib/anon";
import { encryptMessage, decryptMessage } from "../../../../app/sdk/crypto";
import { fetchGroupKey as fetchGroupKeyFromApi } from "../../../../lib/api";

const VOTE_STORAGE_PREFIX = "conclave_vote_";
const GROUP_KEY_STORAGE_PREFIX = "conclave_group_key_";

interface ProposalData {
  room: string;
  creator: string;
  title: string;
  description: string;
  voteYesCount: number;
  voteNoCount: number;
  deadline: number;
  isFinalized: boolean;
}

export default function ProposalDetailPage() {
  const router = useRouter();
  const { roomPda: roomPdaStr, proposalPda: proposalPdaStr } = router.query;
  const { program, programReadOnly, wallet, connection } = useConclaveProgram();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voteStatus, setVoteStatus] = useState<
    "none" | "committed" | "revealed"
  >("none");
  const [voteLoading, setVoteLoading] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [error, setError] = useState("");
  const [roomAuthority, setRoomAuthority] = useState<string | null>(null);
  const [groupKey, setGroupKey] = useState<Uint8Array | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;
  const proposalPda =
    typeof proposalPdaStr === "string" ? proposalPdaStr : null;

  // Update "now" every second so deadline transitions happen live
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const deadlinePassed = proposal ? proposal.deadline <= now : false;

  // Fetch proposal data — always prefer chain for vote counts (source of truth)
  const refreshProposal = useCallback(async () => {
    if (!proposalPda) return;
    // Try chain first (has real-time vote counts)
    if (programReadOnly) {
      try {
        const acc = await (programReadOnly.account as any).proposal.fetch(
          new PublicKey(proposalPda),
        );
        setProposal({
          room: acc.room.toBase58(),
          creator: acc.creator.toBase58(),
          title: acc.title,
          description: acc.description,
          voteYesCount: acc.voteYesCount,
          voteNoCount: acc.voteNoCount,
          deadline: acc.deadline.toNumber(),
          isFinalized: acc.isFinalized,
        });
        setLoading(false);
        return;
      } catch {}
    }
    // Fallback to indexer
    try {
      const data = await fetchProposal(proposalPda);
      setProposal({
        room: data.room,
        creator: data.creator,
        title: data.title,
        description: data.description,
        voteYesCount: data.vote_yes_count,
        voteNoCount: data.vote_no_count,
        deadline: data.deadline,
        isFinalized: data.is_finalized === 1,
      });
    } catch {
      setProposal(null);
    } finally {
      setLoading(false);
    }
  }, [proposalPda, programReadOnly]);

  useEffect(() => {
    refreshProposal();
  }, [refreshProposal]);

  useEffect(() => {
    if (!roomPda) return;
    fetchRoom(roomPda).then((r) => setRoomAuthority(r.authority)).catch(() => {});
    // Load group key for encrypting/decrypting vote data
    (async () => {
      try {
        const raw = localStorage.getItem(GROUP_KEY_STORAGE_PREFIX + roomPda);
        if (raw) { setGroupKey(new Uint8Array(JSON.parse(raw))); return; }
      } catch {}
      try {
        const b64 = await fetchGroupKeyFromApi(roomPda);
        if (b64) setGroupKey(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      } catch {}
    })();
  }, [roomPda]);

  // Determine vote status: check localStorage first (authoritative), then indexer, then chain
  useEffect(() => {
    const pubkey = wallet?.publicKey ?? null;
    if (!proposalPda || !pubkey) return;
    let cancelled = false;
    (async () => {
      // 1. Check localStorage — most reliable source
      const stored = localStorage.getItem(VOTE_STORAGE_PREFIX + proposalPda);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.revealed) {
            if (!cancelled) setVoteStatus("revealed");
            return;
          }
          // Has nonce data = committed but not yet revealed
          if (!cancelled) setVoteStatus("committed");
          return;
        } catch {}
      }

      // 2. Check indexer
      try {
        const votes = await fetchProposalVotes(proposalPda);
        const myVote = votes.find((v) => v.voter === pubkey.toBase58());
        if (myVote) {
          if (!cancelled) setVoteStatus(myVote.is_revealed ? "revealed" : "committed");
          return;
        }
      } catch {}

      // 3. Fallback: check on-chain VoteCommitment PDA exists
      if (program) {
        try {
          const proposalPubkey = new PublicKey(proposalPda);
          const voteCommitmentPda = getVoteCommitmentPda(proposalPubkey, pubkey, program.programId);
          const acc = await connection.getAccountInfo(voteCommitmentPda);
          if (acc) {
            // Account exists on chain — try to decode to check is_revealed
            try {
              const decoded = await (programReadOnly!.account as any).voteCommitment.fetch(voteCommitmentPda);
              if (!cancelled) setVoteStatus(decoded.isRevealed ? "revealed" : "committed");
            } catch {
              if (!cancelled) setVoteStatus("committed");
            }
            return;
          }
        } catch {}
      }

      if (!cancelled) setVoteStatus("none");
    })();
    return () => { cancelled = true; };
  }, [proposalPda, wallet?.publicKey, program, programReadOnly, connection]);

  const handleCastVote = async (voteChoice: 0 | 1) => {
    if (!program || !wallet?.publicKey || !roomPda || !proposalPda || !proposal)
      return;
    if (deadlinePassed) {
      setError("Voting deadline has passed.");
      return;
    }
    if (voteStatus !== "none") {
      setError("You have already voted.");
      return;
    }

    setVoteLoading(true);
    setError("");
    try {
      const { commitment, nonce } = await createVoteCommitment(voteChoice);
      const roomPubkey = new PublicKey(roomPda);
      const proposalPubkey = new PublicKey(proposalPda);
      const memberPda = getMemberPda(
        roomPubkey,
        wallet.publicKey,
        program.programId,
      );
      const voteCommitmentPda = getVoteCommitmentPda(
        proposalPubkey,
        wallet.publicKey,
        program.programId,
      );

      await program.methods
        .castVote(Array.from(commitment))
        .accountsPartial({
          voter: wallet.publicKey,
          room: roomPubkey,
          member: memberPda,
          proposal: proposalPubkey,
          voteCommitment: voteCommitmentPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const voteData = JSON.stringify({ voteChoice, nonce: Array.from(nonce) });
      localStorage.setItem(VOTE_STORAGE_PREFIX + proposalPda, voteData);
      // Backup encrypted vote data to indexer (survives browser clears, device switches)
      if (groupKey) {
        const encrypted = encryptMessage(groupKey, voteData);
        const encB64 = btoa(String.fromCharCode(...encrypted));
        storeVoteData(proposalPda, wallet.publicKey.toBase58(), encB64);
      }
      setVoteStatus("committed");
      notifyIndexer([voteCommitmentPda.toBase58()]);
    } catch (err: any) {
      setError(err?.message || "Vote failed");
    } finally {
      setVoteLoading(false);
    }
  };

  const handleRevealVote = async () => {
    if (!program || !wallet?.publicKey || !proposalPda || !deadlinePassed)
      return;
    if (voteStatus !== "committed") return;

    // Try localStorage first, then fetch encrypted backup from indexer
    let voteChoice: number;
    let nonceArr: number[];
    const raw = localStorage.getItem(VOTE_STORAGE_PREFIX + proposalPda);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.revealed) {
          setVoteStatus("revealed");
          return;
        }
        voteChoice = parsed.voteChoice;
        nonceArr = parsed.nonce;
      } catch {
        setError("Invalid stored vote data.");
        return;
      }
    } else {
      // Fallback: fetch encrypted vote data from indexer
      if (!groupKey) {
        setError("Cannot recover vote data without group key.");
        return;
      }
      const encB64 = await fetchVoteData(proposalPda, wallet.publicKey.toBase58());
      if (!encB64) {
        setError("Vote data not found. It may have been lost.");
        return;
      }
      try {
        const encrypted = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0));
        const decrypted = decryptMessage(groupKey, encrypted);
        const parsed = JSON.parse(decrypted);
        voteChoice = parsed.voteChoice;
        nonceArr = parsed.nonce;
        // Restore to localStorage for next time
        localStorage.setItem(VOTE_STORAGE_PREFIX + proposalPda, decrypted);
      } catch {
        setError("Failed to decrypt vote data from server.");
        return;
      }
    }
    if (voteChoice !== 0 && voteChoice !== 1) {
      setError("Invalid vote choice in stored data.");
      return;
    }
    if (!Array.isArray(nonceArr) || nonceArr.length !== 32) {
      setError("Invalid nonce in stored data.");
      return;
    }

    setRevealLoading(true);
    setError("");
    try {
      const proposalPubkey = new PublicKey(proposalPda);
      const voteCommitmentPda = getVoteCommitmentPda(
        proposalPubkey,
        wallet.publicKey,
        program.programId,
      );

      await program.methods
        .revealVote(voteChoice, nonceArr)
        .accountsPartial({
          voter: wallet.publicKey,
          proposal: proposalPubkey,
          voteCommitment: voteCommitmentPda,
        })
        .rpc();

      setVoteStatus("revealed");
      // Mark as revealed in localStorage (don't delete — prevents "not found" on reload)
      localStorage.setItem(
        VOTE_STORAGE_PREFIX + proposalPda,
        JSON.stringify({ voteChoice, revealed: true }),
      );
      notifyIndexer([voteCommitmentPda.toBase58(), proposalPda]);
      // Re-fetch proposal to get updated vote counts from chain
      setTimeout(() => refreshProposal(), 2000);
    } catch (err: any) {
      setError(err?.message || "Reveal failed");
    } finally {
      setRevealLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!program || !wallet?.publicKey || !proposalPda || !deadlinePassed) return;
    setFinalizeLoading(true);
    setError("");
    try {
      const proposalPubkey = new PublicKey(proposalPda);
      await program.methods
        .finalizeProposal()
        .accountsPartial({
          authority: wallet.publicKey,
          proposal: proposalPubkey,
        })
        .rpc();
      setProposal((prev) => prev ? { ...prev, isFinalized: true } : prev);
      notifyIndexer([proposalPda]);
    } catch (err: any) {
      setError(err?.message || "Finalize failed");
    } finally {
      setFinalizeLoading(false);
    }
  };

  if (!roomPda || !proposalPda) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-conclave-muted">Invalid proposal.</p>
        <Link href="/rooms" className="btn-primary mt-4 inline-block">
          Back to rooms
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center text-conclave-muted">
        Loading proposal…
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-conclave-muted">Proposal not found.</p>
        <Link
          href={`/rooms/${roomPda}`}
          className="btn-primary mt-4 inline-block"
        >
          Back to room
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Link
        href={`/rooms/${roomPda}`}
        className="text-conclave-accent text-sm mb-4 inline-block"
      >
        ← Room
      </Link>

      <div className="card mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{proposal.title}</h1>
          {proposal.isFinalized ? (
            <span className="shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-conclave-muted border border-white/10 font-medium">
              Finalized
            </span>
          ) : deadlinePassed ? (
            <span className="shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 font-medium animate-pulse">
              Reveal Phase
            </span>
          ) : (
            <span className="shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/30 font-medium animate-pulse">
              Voting Open
            </span>
          )}
        </div>
        <p className="text-conclave-muted text-sm mb-1">
          By {roomPda ? getAnonAlias(proposal.creator, roomPda) : "Unknown"}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-conclave-muted mb-4">
          <span>Deadline: {new Date(proposal.deadline * 1000).toLocaleString()}</span>
          {!deadlinePassed && (
            <span className="text-conclave-accent font-medium">
              {(() => {
                const diff = proposal.deadline - now;
                if (diff < 60) return `${diff}s left`;
                if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
                if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m left`;
                return `${Math.floor(diff / 86400)}d left`;
              })()}
            </span>
          )}
        </div>
        {proposal.description && (
          <p className="text-gray-300 whitespace-pre-wrap text-sm">
            {proposal.description}
          </p>
        )}
      </div>

      {/* Results card with progress bar */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">Results</h2>
          <button
            onClick={refreshProposal}
            className="text-conclave-accent text-xs hover:underline"
          >
            Refresh
          </button>
        </div>
        {(() => {
          const total = proposal.voteYesCount + proposal.voteNoCount;
          const yesP = total > 0 ? Math.round((proposal.voteYesCount / total) * 100) : 0;
          const noP = total > 0 ? 100 - yesP : 0;
          return (
            <div className="space-y-3">
              {/* Yes bar */}
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-medium text-green-400">Yes</span>
                  <span className="text-xs text-conclave-muted">{proposal.voteYesCount} votes ({yesP}%)</span>
                </div>
                <div className="h-3 bg-conclave-dark rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all duration-500" style={{width: `${yesP}%`}} />
                </div>
              </div>
              {/* No bar */}
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-medium text-red-400">No</span>
                  <span className="text-xs text-conclave-muted">{proposal.voteNoCount} votes ({noP}%)</span>
                </div>
                <div className="h-3 bg-conclave-dark rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500" style={{width: `${noP}%`}} />
                </div>
              </div>
              <p className="text-[10px] text-conclave-muted pt-1">{total} total votes</p>
            </div>
          );
        })()}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Phase-aware action card */}
      <div className="card mb-6">
        {!deadlinePassed ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <h2 className="font-semibold text-white">Cast Your Vote</h2>
            </div>
            {voteStatus === "none" && (
              <>
                <p className="text-conclave-muted text-sm mb-4">
                  Your vote is secret until the deadline. Choose below to commit a hash — no one can see your choice.
                </p>
                {wallet?.publicKey && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleCastVote(1)}
                      disabled={voteLoading}
                      className="flex-1 rounded-xl border-2 border-green-500/30 bg-green-500/5 px-6 py-3 font-bold text-green-400 uppercase tracking-wider hover:bg-green-500/15 hover:border-green-500/50 transition-all disabled:opacity-50"
                    >
                      {voteLoading ? "..." : "Vote Yes"}
                    </button>
                    <button
                      onClick={() => handleCastVote(0)}
                      disabled={voteLoading}
                      className="flex-1 rounded-xl border-2 border-red-500/30 bg-red-500/5 px-6 py-3 font-bold text-red-400 uppercase tracking-wider hover:bg-red-500/15 hover:border-red-500/50 transition-all disabled:opacity-50"
                    >
                      {voteLoading ? "..." : "Vote No"}
                    </button>
                  </div>
                )}
              </>
            )}
            {voteStatus === "committed" && (
              <div className="flex items-center gap-2 rounded-xl border border-conclave-accent/30 bg-conclave-accent/5 px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-conclave-accent"></div>
                <p className="text-conclave-accent text-sm">
                  Vote committed. You'll reveal it after the deadline passes.
                </p>
              </div>
            )}
            {voteStatus === "revealed" && (
              <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                <p className="text-green-400 text-sm">Vote revealed and counted.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
              <h2 className="font-semibold text-white">Reveal Phase</h2>
            </div>
            <p className="text-conclave-muted text-sm mb-4">
              Voting ended. Members who voted can now reveal their choices.
            </p>
            {voteStatus === "committed" && wallet?.publicKey && (
              <button
                onClick={handleRevealVote}
                disabled={revealLoading}
                className="rounded-xl border-2 border-yellow-500/30 bg-yellow-500/5 px-6 py-3 font-bold text-yellow-400 uppercase tracking-wider hover:bg-yellow-500/15 hover:border-yellow-500/50 transition-all disabled:opacity-50"
              >
                {revealLoading ? "Revealing..." : "Reveal My Vote"}
              </button>
            )}
            {voteStatus === "revealed" && (
              <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                <p className="text-green-400 text-sm">Vote revealed and counted.</p>
              </div>
            )}
            {voteStatus === "none" && (
              <p className="text-conclave-muted text-sm">You did not vote on this proposal.</p>
            )}
          </>
        )}
      </div>

      {proposal.isFinalized && (
        <div className={`card mb-6 border ${
          proposal.voteYesCount > proposal.voteNoCount
            ? "border-green-500/30 bg-green-500/5"
            : proposal.voteNoCount > proposal.voteYesCount
            ? "border-red-500/30 bg-red-500/5"
            : "border-yellow-500/30 bg-yellow-500/5"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-lg font-bold ${
                proposal.voteYesCount > proposal.voteNoCount
                  ? "text-green-400"
                  : proposal.voteNoCount > proposal.voteYesCount
                  ? "text-red-400"
                  : "text-yellow-400"
              }`}>
                {proposal.voteYesCount > proposal.voteNoCount
                  ? "PASSED"
                  : proposal.voteNoCount > proposal.voteYesCount
                  ? "REJECTED"
                  : "TIED"}
              </p>
              <p className="text-conclave-muted text-sm mt-1">
                {proposal.voteYesCount} Yes / {proposal.voteNoCount} No — Finalized on-chain
              </p>
            </div>
            <a
              href={`https://explorer.solana.com/address/${proposalPda}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-full border border-conclave-border text-conclave-accent hover:bg-conclave-accent/10 transition"
            >
              View on Explorer
            </a>
          </div>
        </div>
      )}

      {deadlinePassed && !proposal.isFinalized && wallet?.publicKey && roomAuthority === wallet.publicKey.toBase58() && (
        <div className="card">
          <h2 className="font-semibold text-white mb-3">Finalize proposal</h2>
          <p className="text-conclave-muted text-sm mb-3">
            As room authority, you can finalize this proposal to lock in the results.
          </p>
          <button
            onClick={handleFinalize}
            disabled={finalizeLoading}
            className="btn-primary disabled:opacity-50"
          >
            {finalizeLoading ? "Finalizing…" : "Finalize proposal"}
          </button>
        </div>
      )}
    </div>
  );
}
