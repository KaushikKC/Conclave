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
      } catch { }
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
    fetchRoom(roomPda).then((r) => setRoomAuthority(r.authority)).catch(() => { });
    (async () => {
      try {
        const raw = localStorage.getItem(GROUP_KEY_STORAGE_PREFIX + roomPda);
        if (raw) { setGroupKey(new Uint8Array(JSON.parse(raw))); return; }
      } catch { }
      try {
        const b64 = await fetchGroupKeyFromApi(roomPda);
        if (b64) setGroupKey(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      } catch { }
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
        } catch { }
      }
      try {
        const votes = await fetchProposalVotes(proposalPda);
        const myVote = votes.find((v) => v.voter === pubkey.toBase58());
        if (myVote) {
          if (!cancelled) setVoteStatus(myVote.is_revealed ? "revealed" : "committed");
          return;
        }
      } catch { }
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
        } catch { }
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
    }).catch(() => { });
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
    const clusterParam = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "" : "&cluster=devnet";
    const blinkUrl = `https://dial.to/?action=solana-action:${encodeURIComponent(actionUrl)}${clusterParam}`;
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
    <div className="max-w-4xl mx-auto px-6 py-16 relative">
      {/* Background blobs */}
      <div className="absolute top-0 -left-64 w-96 h-96 bg-conclave-pink/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob z-0 pointer-events-none"></div>
      <div className="absolute bottom-0 -right-64 w-96 h-96 bg-conclave-yellow/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000 z-0 pointer-events-none"></div>

      <div className="relative z-10">
        <Link href={`/rooms/${roomPda}`} className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-conclave-textMuted hover:text-white transition-colors mb-8">
          <span className="text-conclave-pink">&larr;</span> Back to Room
        </Link>

        {/* Header card */}
        <div className="rounded-3xl border border-white/10 bg-conclave-card/60 p-8 sm:p-10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 bg-conclave-yellow rounded-full shadow-[0_0_15px_rgba(255,200,0,0.8)] animate-pulse"></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-conclave-yellow">Proposal</span>
                {isQuadratic && (
                  <span className="text-[10px] px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold uppercase tracking-widest">
                    Quadratic
                  </span>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">{proposal.title}</h1>
              <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted bg-black/40 px-3 py-1.5 rounded-lg inline-flex">
                <span>By</span>
                <span className="text-white">{roomPda ? getAnonAlias(proposal.creator, roomPda) : "Unknown"}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Share as Blink */}
              {!proposal.isFinalized && (
                <button
                  onClick={handleCopyBlink}
                  title="Share as Blink — vote from Twitter, Discord, Telegram"
                  className="btn-secondary !py-2 !px-4 !text-[10px] shadow-[0_0_15px_rgba(237,224,212,0.1)] transition-all"
                >
                  {blinkCopied ? "Link Copied!" : "Share Blink"}
                </button>
              )}
              {proposal.isFinalized ? (
                <span className="text-[10px] px-4 py-2 rounded-xl bg-white/5 text-conclave-textMuted border border-white/10 font-bold uppercase tracking-widest">
                  Finalized
                </span>
              ) : deadlinePassed ? (
                <span className="text-[10px] px-4 py-2 rounded-xl bg-conclave-yellow/10 text-conclave-yellow border border-conclave-yellow/30 font-bold uppercase tracking-widest animate-pulse">
                  Reveal Phase
                </span>
              ) : (
                <span className="text-[10px] px-4 py-2 rounded-xl bg-green-500/10 text-green-400 border border-green-500/30 font-bold uppercase tracking-widest animate-pulse">
                  Voting Open
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mb-8 p-5 bg-black/40 rounded-2xl border border-white/5">
            <div>
              <span className="block mb-1 opacity-60">Deadline</span>
              <span className="text-white text-xs">{new Date(proposal.deadline * 1000).toLocaleString()}</span>
            </div>
            {!deadlinePassed && (
              <div>
                <span className="block mb-1 opacity-60">Time Left</span>
                <span className="text-conclave-yellow text-xs">
                  {(() => {
                    const diff = proposal.deadline - now;
                    if (diff < 60) return `${diff}s left`;
                    if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
                    if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m left`;
                    return `${Math.floor(diff / 86400)}d left`;
                  })()}
                </span>
              </div>
            )}
            {isQuadratic && (
              <div className="sm:col-span-2 mt-2 pt-4 border-t border-white/5">
                <span className="block mb-1 opacity-60 text-purple-400">Quadratic Rules</span>
                <span className="text-purple-300">
                  {proposal.totalCredits} voice credits/member · max {Math.floor(Math.sqrt(proposal.totalCredits))} votes
                </span>
              </div>
            )}
          </div>

          {proposal.description && (
            <div className="prose prose-invert max-w-none">
              <p className="text-white/80 leading-relaxed text-sm p-6 bg-black/50 rounded-2xl border border-white/5 whitespace-pre-wrap">
                {proposal.description}
              </p>
            </div>
          )}
        </div>

        {/* Results card */}
        <div className="rounded-3xl border border-white/10 bg-conclave-card/60 p-8 sm:p-10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
              <div className="w-2 h-2 bg-conclave-blue rounded-full shadow-[0_0_10px_rgba(0,184,241,0.8)] animate-pulse"></div>
              Results {isQuadratic && <span className="text-[10px] text-purple-400 font-bold ml-2">(Weighted)</span>}
            </h2>
            <button onClick={refreshProposal} className="text-[10px] uppercase font-bold tracking-widest text-conclave-blue hover:text-white transition-colors">
              Refresh
            </button>
          </div>

          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-black/40 border border-green-500/20">
              <div className="flex justify-between items-baseline mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-green-400">Yes</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-conclave-textMuted">{proposal.voteYesCount} {voteLabel} ({yesP}%)</span>
              </div>
              <div className="h-4 bg-black/50 rounded-full overflow-hidden shadow-inner border border-white/5">
                <div className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all duration-1000 ease-out relative" style={{ width: `${yesP}%` }}>
                  <div className="absolute inset-0 bg-white/20 w-full h-full animate-[pulse_2s_infinite]"></div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-black/40 border border-red-500/20">
              <div className="flex justify-between items-baseline mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-red-400">No</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-conclave-textMuted">{proposal.voteNoCount} {voteLabel} ({noP}%)</span>
              </div>
              <div className="h-4 bg-black/50 rounded-full overflow-hidden shadow-inner border border-white/5">
                <div className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-1000 ease-out" style={{ width: `${noP}%` }} />
              </div>
            </div>

            <p className="text-[10px] uppercase font-bold tracking-widest text-center text-conclave-textMuted pt-2 bg-white/5 p-3 rounded-xl inline-block mx-auto min-w-[200px] flex justify-center">
              {total} Total {voteLabel}
            </p>
          </div>
        </div>

        {error && <p className="text-red-400 text-[10px] uppercase font-bold tracking-widest mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">{error}</p>}

        {/* Phase-aware action card */}
        <div className="rounded-3xl border border-white/10 bg-conclave-card/60 p-8 sm:p-10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-8">
          {!deadlinePassed ? (
            <>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.8)]"></div>
                <h2 className="text-lg font-black text-white uppercase tracking-widest">Cast Your Vote</h2>
              </div>

              {voteStatus === "none" && (
                isQuadratic ? (
                  /* Quadratic voting UI */
                  <div className="space-y-8 animate-fadeIn">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed p-4 bg-black/40 rounded-xl border border-conclave-pink/10">
                      You have <span className="text-purple-400">{proposal.totalCredits} voice credits</span>. Casting <span className="italic">k</span> votes costs <span className="italic">k²</span> credits — making extreme positions expensive.
                    </p>

                    {/* Direction toggle */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-conclave-text/80 mb-3">Your Position</label>
                      <div className="flex gap-4">
                        <button
                          onClick={() => setQuadVoteChoice(1)}
                          className={`flex-1 rounded-2xl border-2 px-4 py-4 sm:py-6 text-sm sm:text-lg font-black uppercase tracking-widest transition-all ${quadVoteChoice === 1
                            ? "border-green-500 bg-green-500/10 text-green-400 shadow-[0_0_20px_rgba(74,222,128,0.2)]"
                            : "border-white/10 bg-black/50 text-conclave-textMuted hover:border-green-500/50 hover:text-white"
                            }`}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setQuadVoteChoice(0)}
                          className={`flex-1 rounded-2xl border-2 px-4 py-4 sm:py-6 text-sm sm:text-lg font-black uppercase tracking-widest transition-all ${quadVoteChoice === 0
                            ? "border-red-500 bg-red-500/10 text-red-400 shadow-[0_0_20px_rgba(248,113,113,0.2)]"
                            : "border-white/10 bg-black/50 text-conclave-textMuted hover:border-red-500/50 hover:text-white"
                            }`}
                        >
                          No
                        </button>
                      </div>
                    </div>

                    {/* Vote count slider */}
                    <div className="p-6 bg-purple-500/5 rounded-2xl border border-purple-500/20">
                      <div className="flex justify-between items-baseline mb-4">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-purple-300">Votes to cast</label>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400/60">max {maxVotes}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={maxVotes}
                        value={quadVoteCount}
                        onChange={(e) => setQuadVoteCount(parseInt(e.target.value))}
                        className="w-full accent-purple-500 h-2 bg-black rounded-lg appearance-none cursor-pointer mb-6"
                      />
                      <div className="flex flex-col sm:flex-row justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5">
                        <span className="text-2xl font-black text-white mb-2 sm:mb-0">{quadVoteCount} <span className="text-[10px] uppercase tracking-widest text-conclave-textMuted">vote{quadVoteCount !== 1 ? "s" : ""}</span></span>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-right">
                          <span className="block text-purple-400 mb-1">Cost: {quadVoteCount}² = <span className="text-white bg-purple-500/20 px-2 py-1 rounded">{quadCost} credits</span></span>
                          <span className="text-conclave-textMuted opacity-60">({proposal.totalCredits - quadCost} remaining)</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleCastQuadraticVote}
                      disabled={voteLoading}
                      className={`w-full rounded-2xl border-2 px-6 py-5 sm:py-6 text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed ${quadVoteChoice === 1
                        ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20 shadow-[0_0_30px_rgba(74,222,128,0.15)]"
                        : "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 shadow-[0_0_30px_rgba(248,113,113,0.15)]"
                        }`}
                    >
                      {voteLoading ? "Committing Hash…" : `Commit ${quadVoteCount} ${quadVoteChoice === 1 ? "Yes" : "No"} vote${quadVoteCount !== 1 ? "s" : ""}`}
                    </button>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted text-center mt-4">
                      Your vote is secret until the deadline.
                    </p>
                  </div>
                ) : (
                  /* Standard binary voting UI */
                  <div className="animate-fadeIn">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed mb-8 p-4 bg-black/40 rounded-xl border border-white/5 text-center">
                      Your vote is secret until the deadline. Choose below to commit a hash — no one can see your choice.
                    </p>
                    {wallet?.publicKey && (
                      <div className="flex flex-col sm:flex-row gap-4">
                        <button
                          onClick={() => handleCastVote(1)}
                          disabled={voteLoading}
                          className="flex-1 rounded-2xl border border-green-500/30 bg-green-500/10 px-6 py-6 font-black text-green-400 uppercase tracking-widest hover:bg-green-500/20 hover:border-green-500/60 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(74,222,128,0.1)]"
                        >
                          {voteLoading ? "..." : "Vote Yes"}
                        </button>
                        <button
                          onClick={() => handleCastVote(0)}
                          disabled={voteLoading}
                          className="flex-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-6 font-black text-red-400 uppercase tracking-widest hover:bg-red-500/20 hover:border-red-500/60 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(248,113,113,0.1)]"
                        >
                          {voteLoading ? "..." : "Vote No"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
              {voteStatus === "committed" && (
                <div className="flex items-center gap-4 rounded-2xl border border-conclave-pink/30 bg-conclave-pink/10 px-6 py-5 mt-6 animate-pulse-glow">
                  <div className="w-3 h-3 rounded-full bg-conclave-pink shadow-[0_0_15px_rgba(255,77,141,0.8)]"></div>
                  <p className="text-conclave-pink text-xs font-bold uppercase tracking-widest leading-relaxed">
                    Vote hash committed. You must return to reveal it after the deadline passes.
                  </p>
                </div>
              )}
              {voteStatus === "revealed" && (
                <div className="flex items-center gap-4 rounded-2xl border border-green-500/30 bg-green-500/10 px-6 py-5 mt-6">
                  <div className="w-3 h-3 rounded-full bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.8)]"></div>
                  <p className="text-green-400 text-xs font-bold uppercase tracking-widest leading-relaxed">Vote revealed and recorded on-chain.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                <div className="w-2 h-2 rounded-full bg-conclave-yellow animate-pulse shadow-[0_0_10px_rgba(255,200,0,0.8)]"></div>
                <h2 className="text-lg font-black text-white uppercase tracking-widest">Reveal Phase</h2>
              </div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed mb-8 p-4 bg-black/40 rounded-xl border border-white/5 text-center">
                Voting ended. Members who voted can now reveal their choices to be counted.
              </p>
              {voteStatus === "committed" && wallet?.publicKey && (
                <button
                  onClick={handleRevealVote}
                  disabled={revealLoading}
                  className="w-full rounded-2xl border border-conclave-yellow/30 bg-conclave-yellow/10 px-6 py-6 font-black text-conclave-yellow uppercase tracking-widest hover:bg-conclave-yellow/20 hover:border-conclave-yellow/60 transition-all disabled:opacity-50 shadow-[0_0_30px_rgba(255,200,0,0.15)] animate-pulse-glow hover:animate-none"
                >
                  {revealLoading ? "Revealing transaction..." : "Reveal My Vote"}
                </button>
              )}
              {voteStatus === "revealed" && (
                <div className="flex items-center gap-4 rounded-2xl border border-green-500/30 bg-green-500/10 px-6 py-5">
                  <div className="w-3 h-3 rounded-full bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.8)]"></div>
                  <p className="text-green-400 text-xs font-bold uppercase tracking-widest leading-relaxed">Vote successfully revealed and counted.</p>
                </div>
              )}
              {voteStatus === "none" && (
                <div className="text-center p-6 bg-black/40 rounded-2xl border border-white/5">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted">You did not vote on this proposal.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Finalized result */}
        {proposal.isFinalized && (
          <div className={`rounded-3xl border border-white/10 p-8 sm:p-10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-8 animate-fadeIn ${proposal.voteYesCount > proposal.voteNoCount
            ? "bg-gradient-to-br from-green-500/10 to-black/60 border-green-500/30"
            : proposal.voteNoCount > proposal.voteYesCount
              ? "bg-gradient-to-br from-red-500/10 to-black/60 border-red-500/30"
              : "bg-gradient-to-br from-conclave-yellow/10 to-black/60 border-conclave-yellow/30"
            }`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <p className={`text-3xl font-black uppercase tracking-widest mb-2 flex items-center gap-3 ${proposal.voteYesCount > proposal.voteNoCount ? "text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]"
                  : proposal.voteNoCount > proposal.voteYesCount ? "text-red-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.5)]"
                    : "text-conclave-yellow drop-shadow-[0_0_15px_rgba(255,200,0,0.5)]"
                  }`}>
                  {proposal.voteYesCount > proposal.voteNoCount ? (
                    <><span className="text-xl">✓</span> PASSED</>
                  ) : proposal.voteNoCount > proposal.voteYesCount ? (
                    <><span className="text-xl">✗</span> REJECTED</>
                  ) : (
                    <><span className="text-xl">≈</span> TIED</>
                  )}
                </p>
                <div className="inline-block mt-2 px-4 py-2 rounded-xl bg-black/40 border border-white/10">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted">
                    {proposal.voteYesCount} Yes / {proposal.voteNoCount} No {isQuadratic ? <span className="text-purple-400 ml-1">(voice credits)</span> : ""}
                  </p>
                </div>
              </div>
              <a
                href={`https://explorer.solana.com/address/${proposalPda}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet'}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary !py-3 !px-6 !text-[10px] whitespace-nowrap bg-black/50 hover:bg-white/10"
              >
                Verify on Explorer &nearr;
              </a>
            </div>
          </div>
        )}

        {/* Finalize button (room authority only) */}
        {deadlinePassed && !proposal.isFinalized && wallet?.publicKey && roomAuthority === wallet.publicKey.toBase58() && (
          <div className="rounded-3xl border border-white/10 bg-conclave-card/60 p-8 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-8">
            <h2 className="text-lg font-black text-white uppercase tracking-widest mb-3 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-conclave-pink"></span>
              Finalize Proposal
            </h2>
            <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed mb-6">
              As workspace authority, compute the final tally on-chain to lock the results and enable treasury execution if passed.
            </p>
            <button
              onClick={handleFinalize}
              disabled={finalizeLoading}
              className="btn-primary w-full shadow-[0_0_30px_rgba(255,77,141,0.2)] disabled:opacity-50"
            >
              {finalizeLoading ? "Processing Finalization…" : "Finalize Results On-Chain"}
            </button>
          </div>
        )}

        {/* Treasury Execution — shown when proposal passed and authority is connected */}
        {proposal.isFinalized &&
          proposal.voteYesCount > proposal.voteNoCount &&
          wallet?.publicKey &&
          roomAuthority === wallet.publicKey.toBase58() && (
            <div className="rounded-3xl border border-green-500/20 bg-green-500/5 p-8 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              <h2 className="text-lg font-black text-green-400 uppercase tracking-widest mb-3 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                Execute Treasury Action
              </h2>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-6 border-b border-green-500/10">
                <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed max-w-sm">
                  Proposal passed. As authority, you can now transfer funds from the workspace treasury.
                </p>
                {treasuryBalance !== null && (
                  <div className="bg-black/40 px-4 py-2 rounded-xl border border-green-500/20 whitespace-nowrap">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mr-2">Treasury</span>
                    <span className="text-green-400 font-mono font-bold text-sm bg-green-500/10 px-2 py-0.5 rounded">{treasuryBalance.toFixed(4)} SOL</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] uppercase font-bold tracking-widest text-green-400/80 mb-2">Recipient Address</label>
                    <input
                      type="text"
                      value={executeRecipient}
                      onChange={(e) => setExecuteRecipient(e.target.value)}
                      placeholder="Enter Solana wallet address"
                      className="w-full bg-black/50 border border-green-500/20 rounded-xl px-5 py-4 text-sm text-white focus:border-green-400 focus:shadow-[0_0_15px_rgba(74,222,128,0.2)] focus:outline-none transition-all font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-widest text-green-400/80 mb-2">Amount (SOL)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={executeAmount}
                      onChange={(e) => setExecuteAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/50 border border-green-500/20 rounded-xl px-5 py-4 text-sm text-white focus:border-green-400 focus:shadow-[0_0_15px_rgba(74,222,128,0.2)] focus:outline-none transition-all font-mono"
                    />
                  </div>
                </div>
                <button
                  onClick={handleExecuteAction}
                  disabled={executeLoading || treasuryBalance === 0}
                  className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-400 hover:from-green-500 hover:to-green-300 text-white font-black uppercase tracking-widest py-4 transition-all disabled:opacity-50 disabled:grayscale shadow-[0_0_30px_rgba(74,222,128,0.3)] mt-2"
                >
                  {executeLoading ? "Processing Transfer…" : "Execute Transfer"}
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
