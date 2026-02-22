"use client";

import { useRouter } from "next/router";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useConclaveProgram } from "../../../../hooks/useConclaveProgram";
import { getMemberPda, getVoteCommitmentPda, getTreasuryPda } from "../../../../lib/conclave";
import { createVoteCommitment, createQuadraticVoteCommitment } from "../../../../app/sdk/crypto";
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
  voteMode: number;    // 0 = standard, 1 = quadratic
  totalCredits: number;
}

export default function ProposalDetailPage() {
  const router = useRouter();
  const { roomPda: roomPdaStr, proposalPda: proposalPdaStr } = router.query;
  const { program, programReadOnly, wallet, connection } = useConclaveProgram();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voteStatus, setVoteStatus] = useState<"none" | "committed" | "revealed">("none");
  const [voteLoading, setVoteLoading] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeRecipient, setExecuteRecipient] = useState("");
  const [executeAmount, setExecuteAmount] = useState("0.01");
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [roomAuthority, setRoomAuthority] = useState<string | null>(null);
  const [groupKey, setGroupKey] = useState<Uint8Array | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [blinkCopied, setBlinkCopied] = useState(false);

  // Quadratic voting state
  const [quadVoteCount, setQuadVoteCount] = useState(1);
  const [quadVoteChoice, setQuadVoteChoice] = useState<0 | 1>(1);

  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;
  const proposalPda = typeof proposalPdaStr === "string" ? proposalPdaStr : null;

  const isQuadratic = proposal?.voteMode === 1;
  const maxVotes = isQuadratic && proposal ? Math.floor(Math.sqrt(proposal.totalCredits)) : 0;
  const quadCost = quadVoteCount * quadVoteCount;

  // Update "now" every second so deadline transitions happen live
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const deadlinePassed = proposal ? proposal.deadline <= now : false;

  // Fetch proposal data — always prefer chain for vote counts (source of truth)
  const refreshProposal = useCallback(async () => {
    if (!proposalPda) return;
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
          voteMode: acc.voteMode ?? 0,
          totalCredits: acc.totalCredits ?? 0,
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
        voteMode: 0,
        totalCredits: 0,
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

  // Determine vote status from localStorage → indexer → chain
  useEffect(() => {
    const pubkey = wallet?.publicKey ?? null;
    if (!proposalPda || !pubkey) return;
    let cancelled = false;
    (async () => {
      const stored = localStorage.getItem(VOTE_STORAGE_PREFIX + proposalPda);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (!cancelled) setVoteStatus(parsed.revealed ? "revealed" : "committed");
          return;
        } catch {}
      }
      try {
        const votes = await fetchProposalVotes(proposalPda);
        const myVote = votes.find((v) => v.voter === pubkey.toBase58());
        if (myVote) {
          if (!cancelled) setVoteStatus(myVote.is_revealed ? "revealed" : "committed");
          return;
        }
      } catch {}
      if (program) {
        try {
          const proposalPubkey = new PublicKey(proposalPda);
          const voteCommitmentPda = getVoteCommitmentPda(proposalPubkey, pubkey, program.programId);
          const acc = await connection.getAccountInfo(voteCommitmentPda);
          if (acc) {
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

  // --- Vote handlers ---

  const handleCastVote = async (voteChoice: 0 | 1) => {
    if (!program || !wallet?.publicKey || !roomPda || !proposalPda || !proposal) return;
    if (deadlinePassed) { setError("Voting deadline has passed."); return; }
    if (voteStatus !== "none") { setError("You have already voted."); return; }

    setVoteLoading(true);
    setError("");
    try {
      const { commitment, nonce } = await createVoteCommitment(voteChoice);
      const roomPubkey = new PublicKey(roomPda);
      const proposalPubkey = new PublicKey(proposalPda);
      const memberPda = getMemberPda(roomPubkey, wallet.publicKey, program.programId);
      const voteCommitmentPda = getVoteCommitmentPda(proposalPubkey, wallet.publicKey, program.programId);

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

  const handleCastQuadraticVote = async () => {
    if (!program || !wallet?.publicKey || !roomPda || !proposalPda || !proposal) return;
    if (deadlinePassed) { setError("Voting deadline has passed."); return; }
    if (voteStatus !== "none") { setError("You have already voted."); return; }
    if (quadVoteCount < 1 || quadVoteCount > maxVotes) {
      setError(`Vote count must be between 1 and ${maxVotes}.`);
      return;
    }

    setVoteLoading(true);
    setError("");
    try {
      const { commitment, nonce } = await createQuadraticVoteCommitment(quadVoteCount, quadVoteChoice);
      const roomPubkey = new PublicKey(roomPda);
      const proposalPubkey = new PublicKey(proposalPda);
      const memberPda = getMemberPda(roomPubkey, wallet.publicKey, program.programId);
      const voteCommitmentPda = getVoteCommitmentPda(proposalPubkey, wallet.publicKey, program.programId);

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

      const voteData = JSON.stringify({
        voteChoice: quadVoteChoice,
        voteCount: quadVoteCount,
        nonce: Array.from(nonce),
        isQuadratic: true,
      });
      localStorage.setItem(VOTE_STORAGE_PREFIX + proposalPda, voteData);
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
    if (!program || !wallet?.publicKey || !proposalPda || !deadlinePassed) return;
    if (voteStatus !== "committed") return;

    let voteChoice: number;
    let voteCount: number = 1;
    let nonceArr: number[];
    let isQuadraticVote = false;

    const raw = localStorage.getItem(VOTE_STORAGE_PREFIX + proposalPda);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.revealed) { setVoteStatus("revealed"); return; }
        voteChoice = parsed.voteChoice;
        nonceArr = parsed.nonce;
        isQuadraticVote = !!parsed.isQuadratic;
        if (isQuadraticVote) voteCount = parsed.voteCount;
      } catch {
        setError("Invalid stored vote data.");
        return;
      }
    } else {
      const encB64 = await fetchVoteData(proposalPda, wallet.publicKey.toBase58());
      if (!encB64) { setError("Vote data not found. It may have been lost."); return; }

      let parsed: any = null;
      // Case 1: Blink vote — data stored as plain JSON (no group key available during blink)
      try { parsed = JSON.parse(encB64); } catch { /* not plain JSON */ }

      // Case 2: App vote — data stored as base64(encrypted(JSON))
      if (!parsed) {
        if (!groupKey) { setError("Cannot recover vote data without group key."); return; }
        try {
          const encrypted = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0));
          const decrypted = decryptMessage(groupKey, encrypted);
          parsed = JSON.parse(decrypted);
        } catch {
          setError("Failed to decrypt vote data from server.");
          return;
        }
      }

      voteChoice = parsed.voteChoice;
      nonceArr = parsed.nonce;
      isQuadraticVote = !!parsed.isQuadratic;
      if (isQuadraticVote) voteCount = parsed.voteCount;
      localStorage.setItem(VOTE_STORAGE_PREFIX + proposalPda, JSON.stringify(parsed));
    }

    if (voteChoice! !== 0 && voteChoice! !== 1) { setError("Invalid vote choice."); return; }
    if (!Array.isArray(nonceArr!) || nonceArr!.length !== 32) { setError("Invalid nonce."); return; }

    setRevealLoading(true);
    setError("");
    try {
      const proposalPubkey = new PublicKey(proposalPda);
      const voteCommitmentPda = getVoteCommitmentPda(proposalPubkey, wallet.publicKey, program.programId);

      if (isQuadraticVote) {
        await program.methods
          .revealQuadraticVote(voteCount, voteChoice!, nonceArr!)
          .accountsPartial({
            voter: wallet.publicKey,
            proposal: proposalPubkey,
            voteCommitment: voteCommitmentPda,
          })
          .rpc();
      } else {
        await program.methods
          .revealVote(voteChoice!, nonceArr!)
          .accountsPartial({
            voter: wallet.publicKey,
            proposal: proposalPubkey,
            voteCommitment: voteCommitmentPda,
          })
          .rpc();
      }

      setVoteStatus("revealed");
      localStorage.setItem(
        VOTE_STORAGE_PREFIX + proposalPda,
        JSON.stringify({ voteChoice, revealed: true }),
      );
      notifyIndexer([voteCommitmentPda.toBase58(), proposalPda]);
      setTimeout(() => refreshProposal(), 2000);
    } catch (err: any) {
      setError(err?.message || "Reveal failed");
    } finally {
      setRevealLoading(false);
    }
  };

  // Fetch treasury balance when proposal is finalized and passed
  useEffect(() => {
    if (!proposal?.isFinalized || !proposal?.room || !program) return;
    if (proposal.voteYesCount <= proposal.voteNoCount) return;
    const roomPubkey = new PublicKey(proposal.room);
    const treasuryPda = getTreasuryPda(roomPubkey, program.programId);
    connection.getAccountInfo(treasuryPda).then((info) => {
      if (info) setTreasuryBalance(info.lamports / 1e9);
    }).catch(() => {});
  }, [proposal?.isFinalized, proposal?.room, program, connection]);

  const handleExecuteAction = async () => {
    if (!program || !wallet?.publicKey || !proposalPda || !proposal) return;
    const lamports = Math.round(parseFloat(executeAmount) * 1e9);
    if (!lamports || lamports <= 0 || !executeRecipient) {
      setError("Enter valid recipient and amount.");
      return;
    }
    let recipientPubkey: PublicKey;
    try { recipientPubkey = new PublicKey(executeRecipient); } catch {
      setError("Invalid recipient address.");
      return;
    }

    setExecuteLoading(true);
    setError("");
    try {
      const roomPubkey = new PublicKey(proposal.room);
      const proposalPubkey = new PublicKey(proposalPda);
      const treasuryPda = getTreasuryPda(roomPubkey, program.programId);
      const BN = require("@coral-xyz/anchor").BN;
      await program.methods
        .executeProposalAction(new BN(lamports))
        .accountsPartial({
          authority: wallet.publicKey,
          room: roomPubkey,
          proposal: proposalPubkey,
          treasury: treasuryPda,
          recipient: recipientPubkey,
        })
        .rpc();
      setTreasuryBalance((prev) => prev !== null ? prev - lamports / 1e9 : null);
      setExecuteRecipient("");
      setExecuteAmount("0.01");
      notifyIndexer([proposalPda, treasuryPda.toBase58()]);
    } catch (err: any) {
      setError(err?.message || "Execute failed");
    } finally {
      setExecuteLoading(false);
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
        .accountsPartial({ authority: wallet.publicKey, proposal: proposalPubkey })
        .rpc();
      setProposal((prev) => prev ? { ...prev, isFinalized: true } : prev);
      notifyIndexer([proposalPda]);
    } catch (err: any) {
      setError(err?.message || "Finalize failed");
    } finally {
      setFinalizeLoading(false);
    }
  };

  const handleCopyBlink = () => {
    if (!proposalPda) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const actionUrl = `${origin}/api/actions/vote/${proposalPda}`;
    const blinkUrl = `https://dial.to/?action=solana-action:${encodeURIComponent(actionUrl)}`;
    navigator.clipboard.writeText(blinkUrl).then(() => {
      setBlinkCopied(true);
      setTimeout(() => setBlinkCopied(false), 2000);
    });
  };

  if (!roomPda || !proposalPda) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-conclave-muted">Invalid proposal.</p>
        <Link href="/rooms" className="btn-primary mt-4 inline-block">Back to rooms</Link>
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
        <Link href={`/rooms/${roomPda}`} className="btn-primary mt-4 inline-block">Back to room</Link>
      </div>
    );
  }

  const total = proposal.voteYesCount + proposal.voteNoCount;
  const yesP = total > 0 ? Math.round((proposal.voteYesCount / total) * 100) : 0;
  const noP = total > 0 ? 100 - yesP : 0;
  const voteLabel = isQuadratic ? "voice credits" : "votes";

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Link href={`/rooms/${roomPda}`} className="text-conclave-accent text-sm mb-4 inline-block">
        ← Room
      </Link>

      {/* Header card */}
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{proposal.title}</h1>
            {isQuadratic && (
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 font-medium">
                Quadratic
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Share as Blink */}
            {!proposal.isFinalized && (
              <button
                onClick={handleCopyBlink}
                title="Share as Blink — vote from Twitter, Discord, Telegram"
                className="text-[10px] px-2.5 py-1 rounded-full border border-conclave-border text-conclave-muted hover:text-conclave-accent hover:border-conclave-accent/50 transition"
              >
                {blinkCopied ? "Copied!" : "Share Blink"}
              </button>
            )}
            {proposal.isFinalized ? (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-conclave-muted border border-white/10 font-medium">
                Finalized
              </span>
            ) : deadlinePassed ? (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 font-medium animate-pulse">
                Reveal Phase
              </span>
            ) : (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/30 font-medium animate-pulse">
                Voting Open
              </span>
            )}
          </div>
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
          {isQuadratic && (
            <span className="text-purple-400">
              {proposal.totalCredits} voice credits/member · max {Math.floor(Math.sqrt(proposal.totalCredits))} votes
            </span>
          )}
        </div>
        {proposal.description && (
          <p className="text-gray-300 whitespace-pre-wrap text-sm">{proposal.description}</p>
        )}
      </div>

      {/* Results card */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">
            Results {isQuadratic && <span className="text-xs text-purple-400 font-normal ml-1">(weighted)</span>}
          </h2>
          <button onClick={refreshProposal} className="text-conclave-accent text-xs hover:underline">
            Refresh
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-medium text-green-400">Yes</span>
              <span className="text-xs text-conclave-muted">{proposal.voteYesCount} {voteLabel} ({yesP}%)</span>
            </div>
            <div className="h-3 bg-conclave-dark rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all duration-500" style={{ width: `${yesP}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-medium text-red-400">No</span>
              <span className="text-xs text-conclave-muted">{proposal.voteNoCount} {voteLabel} ({noP}%)</span>
            </div>
            <div className="h-3 bg-conclave-dark rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500" style={{ width: `${noP}%` }} />
            </div>
          </div>
          <p className="text-[10px] text-conclave-muted pt-1">{total} total {voteLabel}</p>
        </div>
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
              isQuadratic ? (
                /* Quadratic voting UI */
                <div className="space-y-4">
                  <p className="text-conclave-muted text-sm">
                    You have <span className="text-purple-400 font-semibold">{proposal.totalCredits} voice credits</span>. Casting k votes costs k² credits — making extreme positions expensive.
                  </p>

                  {/* Direction toggle */}
                  <div>
                    <label className="block text-xs text-conclave-muted mb-2">Your position</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setQuadVoteChoice(1)}
                        className={`flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-all ${
                          quadVoteChoice === 1
                            ? "border-green-500 bg-green-500/10 text-green-400"
                            : "border-conclave-border bg-conclave-dark text-conclave-muted hover:border-green-500/50"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setQuadVoteChoice(0)}
                        className={`flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-all ${
                          quadVoteChoice === 0
                            ? "border-red-500 bg-red-500/10 text-red-400"
                            : "border-conclave-border bg-conclave-dark text-conclave-muted hover:border-red-500/50"
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {/* Vote count slider */}
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="text-xs text-conclave-muted">Votes to cast</label>
                      <span className="text-xs text-conclave-muted">max {maxVotes}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={maxVotes}
                      value={quadVoteCount}
                      onChange={(e) => setQuadVoteCount(parseInt(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="text-lg font-bold text-white">{quadVoteCount} vote{quadVoteCount !== 1 ? "s" : ""}</span>
                      <span className="text-sm text-purple-400">
                        Cost: {quadVoteCount}² = <span className="font-semibold">{quadCost} credits</span>
                        <span className="text-conclave-muted text-xs ml-1">
                          ({proposal.totalCredits - quadCost} remaining)
                        </span>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleCastQuadraticVote}
                    disabled={voteLoading}
                    className={`w-full rounded-xl border-2 px-6 py-3 font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
                      quadVoteChoice === 1
                        ? "border-green-500/40 bg-green-500/5 text-green-400 hover:bg-green-500/15 hover:border-green-500/60"
                        : "border-red-500/40 bg-red-500/5 text-red-400 hover:bg-red-500/15 hover:border-red-500/60"
                    }`}
                  >
                    {voteLoading ? "Committing…" : `Commit ${quadVoteCount} ${quadVoteChoice === 1 ? "Yes" : "No"} vote${quadVoteCount !== 1 ? "s" : ""}`}
                  </button>
                  <p className="text-xs text-conclave-muted text-center">
                    Your vote is secret until the deadline.
                  </p>
                </div>
              ) : (
                /* Standard binary voting UI */
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
              )
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

      {/* Finalized result */}
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
                proposal.voteYesCount > proposal.voteNoCount ? "text-green-400"
                  : proposal.voteNoCount > proposal.voteYesCount ? "text-red-400"
                  : "text-yellow-400"
              }`}>
                {proposal.voteYesCount > proposal.voteNoCount ? "PASSED"
                  : proposal.voteNoCount > proposal.voteYesCount ? "REJECTED"
                  : "TIED"}
              </p>
              <p className="text-conclave-muted text-sm mt-1">
                {proposal.voteYesCount} Yes / {proposal.voteNoCount} No {isQuadratic ? "(voice credits)" : ""} — Finalized on-chain
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

      {/* Finalize button (room authority only) */}
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

      {/* Treasury Execution — shown when proposal passed and authority is connected */}
      {proposal.isFinalized &&
        proposal.voteYesCount > proposal.voteNoCount &&
        wallet?.publicKey &&
        roomAuthority === wallet.publicKey.toBase58() && (
        <div className="card border border-green-500/20">
          <h2 className="font-semibold text-white mb-1">Execute Treasury Action</h2>
          <p className="text-conclave-muted text-sm mb-3">
            This proposal passed. As room authority, you can transfer SOL from the treasury.
            {treasuryBalance !== null && (
              <span className="text-conclave-accent ml-1">
                Treasury: {treasuryBalance.toFixed(4)} SOL
              </span>
            )}
          </p>
          <div className="space-y-2">
            <input
              type="text"
              value={executeRecipient}
              onChange={(e) => setExecuteRecipient(e.target.value)}
              placeholder="Recipient wallet address"
              className="w-full bg-conclave-dark border border-conclave-border rounded-lg px-3 py-2 text-sm text-white placeholder-conclave-muted focus:outline-none focus:border-conclave-accent"
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={executeAmount}
                onChange={(e) => setExecuteAmount(e.target.value)}
                placeholder="SOL amount"
                className="w-32 bg-conclave-dark border border-conclave-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-conclave-accent"
              />
              <button
                onClick={handleExecuteAction}
                disabled={executeLoading}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {executeLoading ? "Executing…" : "Execute Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
