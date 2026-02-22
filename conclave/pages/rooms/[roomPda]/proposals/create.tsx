"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useConclaveProgram } from "../../../../hooks/useConclaveProgram";
import { getMemberPda, getProposalPda } from "../../../../lib/conclave";
import { notifyIndexer } from "../../../../lib/api";

const MAX_TITLE = 100;
const MAX_DESC = 500;

export default function CreateProposalPage() {
  const router = useRouter();
  const { roomPda: roomPdaStr } = router.query;
  const { program, wallet } = useConclaveProgram();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineInput, setDeadlineInput] = useState("");
  const [voteMode, setVoteMode] = useState<0 | 1>(0);
  const [totalCredits, setTotalCredits] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !wallet?.publicKey || !roomPda) {
      setError("Wallet or room missing.");
      return;
    }
    const t = title.trim();
    const d = description.trim();
    if (!t) {
      setError("Title is required.");
      return;
    }
    if (t.length > MAX_TITLE) {
      setError(`Title must be ${MAX_TITLE} characters or less.`);
      return;
    }
    if (d.length > MAX_DESC) {
      setError(`Description must be ${MAX_DESC} characters or less.`);
      return;
    }
    const deadline = new Date(deadlineInput).getTime() / 1000;
    if (isNaN(deadline) || deadline <= Date.now() / 1000) {
      setError("Deadline must be a future date/time.");
      return;
    }
    if (voteMode === 1 && totalCredits < 1) {
      setError("Voice credits must be at least 1.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const roomPubkey = new PublicKey(roomPda);
      const memberPda = getMemberPda(roomPubkey, wallet.publicKey, program.programId);
      const proposalPda = getProposalPda(roomPubkey, t, program.programId);

      await program.methods
        .createProposal(t, d, new anchor.BN(deadline), voteMode, totalCredits)
        .accountsPartial({
          creator: wallet.publicKey,
          room: roomPubkey,
          member: memberPda,
          proposal: proposalPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      notifyIndexer([proposalPda.toBase58(), roomPda]);
      router.push(`/rooms/${roomPda}/proposals/${proposalPda.toBase58()}`);
    } catch (err: any) {
      setError(err?.message || "Transaction failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!roomPda) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-conclave-muted">Invalid room.</p>
        <Link href="/rooms" className="btn-primary mt-4 inline-block">Back to rooms</Link>
      </div>
    );
  }

  const minDatetime = new Date();
  minDatetime.setMinutes(minDatetime.getMinutes() + 1);
  const minStr = minDatetime.toISOString().slice(0, 16);
  const maxVotes = voteMode === 1 ? Math.floor(Math.sqrt(totalCredits)) : null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 relative">
      {/* Background blobs */}
      <div className="absolute top-0 -left-64 w-96 h-96 bg-conclave-pink/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob z-0 pointer-events-none"></div>
      <div className="absolute bottom-0 -right-64 w-96 h-96 bg-conclave-yellow/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000 z-0 pointer-events-none"></div>

      <div className="relative z-10 text-center mb-12">
        <Link href={`/rooms/${roomPda}`} className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-conclave-textMuted hover:text-white transition-colors mb-8">
          <span className="text-conclave-pink">&larr;</span> Back to Room
        </Link>
        <h1 className="text-4xl font-black text-conclave-text uppercase tracking-widest mb-4 inline-flex items-center gap-4">
          <div className="w-3 h-3 bg-conclave-yellow rounded-full shadow-[0_0_15px_rgba(255,200,0,0.8)] animate-pulse"></div>
          Create Proposal
        </h1>
        <p className="text-sm text-conclave-textMuted uppercase tracking-widest font-medium max-w-md mx-auto leading-relaxed">
          Draft and submit a new proposal to the workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative z-10 rounded-3xl border border-white/10 bg-conclave-card/60 p-8 sm:p-12 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] space-y-8 animate-fadeIn">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-conclave-text/80 mb-3">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            placeholder="What are we voting on?"
            className="w-full rounded-xl border border-white/10 bg-black/50 px-5 py-4 text-white placeholder-conclave-textMuted focus:border-conclave-yellow focus:shadow-[0_0_20px_rgba(255,200,0,0.2)] focus:outline-none transition-all font-medium text-lg"
          />
          <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mt-2 text-right">{title.length} / {MAX_TITLE}</p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-conclave-text/80 mb-3">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESC}
            rows={5}
            placeholder="Explain the context and impact of this proposal…"
            className="w-full rounded-xl border border-white/10 bg-black/50 px-5 py-4 text-white placeholder-conclave-textMuted focus:border-conclave-yellow focus:shadow-[0_0_20px_rgba(255,200,0,0.2)] focus:outline-none transition-all resize-none text-sm"
          />
          <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mt-2 text-right">{description.length} / {MAX_DESC}</p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-conclave-text/80 mb-3">Voting Deadline</label>
          <input
            type="datetime-local"
            value={deadlineInput}
            onChange={(e) => setDeadlineInput(e.target.value)}
            min={minStr}
            className="w-full rounded-xl border border-white/10 bg-black/50 px-5 py-4 text-white focus:border-conclave-yellow focus:shadow-[0_0_20px_rgba(255,200,0,0.2)] focus:outline-none transition-all font-mono"
          />
        </div>

        {/* Vote mode selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-conclave-text/80 mb-3">Voting Mechanism</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setVoteMode(0)}
              className={`rounded-2xl border-2 p-5 text-left transition-all duration-300 group ${voteMode === 0
                  ? "border-conclave-yellow bg-conclave-yellow/10"
                  : "border-white/10 bg-black/50 hover:border-conclave-yellow/50"
                }`}
            >
              <div className={`font-black uppercase tracking-widest mb-2 transition-colors ${voteMode === 0 ? "text-conclave-yellow" : "text-white group-hover:text-conclave-yellow/70"}`}>Standard</div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed">Yes / No — 1 vote per member</div>
            </button>
            <button
              type="button"
              onClick={() => setVoteMode(1)}
              className={`rounded-2xl border-2 p-5 text-left transition-all duration-300 group ${voteMode === 1
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-white/10 bg-black/50 hover:border-purple-500/50"
                }`}
            >
              <div className={`font-black uppercase tracking-widest mb-2 transition-colors ${voteMode === 1 ? "text-purple-400" : "text-white group-hover:text-purple-400/70"}`}>Quadratic</div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed">Voice credits — cost = votes²</div>
            </button>
          </div>
        </div>

        {/* Quadratic config */}
        {voteMode === 1 && (
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-6 space-y-5 animate-fadeIn">
            <div className="flex items-center gap-3 border-b border-purple-500/20 pb-4">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-purple-300">Quadratic Configuration</span>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest text-conclave-text/80 mb-2">
                Voice Credits Allocation
              </label>
              <input
                type="number"
                value={totalCredits}
                onChange={(e) => setTotalCredits(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={10000}
                className="w-full rounded-xl border border-purple-500/30 bg-black/50 px-5 py-4 text-white focus:border-purple-500 focus:shadow-[0_0_20px_rgba(168,85,247,0.2)] focus:outline-none transition-all font-mono"
              />
              {maxVotes !== null && (
                <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mt-3 text-right">
                  Max <span className="text-purple-400 text-sm">{maxVotes}</span> votes/member (√{totalCredits} = {maxVotes})
                </p>
              )}
            </div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed">
              Allocating <span className="text-white">{totalCredits}</span> credits. Cost of <span className="italic text-purple-400">k</span> votes is <span className="italic text-purple-400">k²</span> credits. Penalizes extreme positions.
            </p>
          </div>
        )}

        {error && <p className="text-red-400 text-[10px] uppercase font-bold tracking-widest bg-red-500/10 border border-red-500/20 p-4 rounded-xl">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-4 pt-8 mt-4 border-t border-white/10">
          <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50 shadow-[0_0_30px_rgba(255,200,0,0.15)] focus:ring focus:ring-conclave-yellow/50">
            {loading ? "Submitting…" : "Publish Proposal"}
          </button>
          <Link href={`/rooms/${roomPda}`} className="btn-secondary !px-10 text-center">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
