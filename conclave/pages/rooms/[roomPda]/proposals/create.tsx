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
    <div className="max-w-lg mx-auto px-4 py-10">
      <Link href={`/rooms/${roomPda}`} className="text-conclave-accent text-sm mb-4 inline-block">← Room</Link>
      <h1 className="text-2xl font-bold text-white mb-2">Create proposal</h1>
      <p className="text-conclave-muted mb-6">Only room members can create proposals.</p>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            placeholder="Proposal title"
            className="w-full rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none"
          />
          <p className="text-xs text-conclave-muted mt-1">{title.length}/{MAX_TITLE}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESC}
            rows={4}
            placeholder="Describe the proposal…"
            className="w-full rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none resize-none"
          />
          <p className="text-xs text-conclave-muted mt-1">{description.length}/{MAX_DESC}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Voting deadline</label>
          <input
            type="datetime-local"
            value={deadlineInput}
            onChange={(e) => setDeadlineInput(e.target.value)}
            min={minStr}
            className="w-full rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white focus:border-conclave-accent focus:outline-none"
          />
        </div>

        {/* Vote mode selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Voting mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVoteMode(0)}
              className={`rounded-xl border-2 px-4 py-3 text-sm font-medium text-left transition-all ${
                voteMode === 0
                  ? "border-conclave-accent bg-conclave-accent/10 text-conclave-accent"
                  : "border-conclave-border bg-conclave-dark text-conclave-muted hover:border-conclave-accent/50"
              }`}
            >
              <div className="font-semibold mb-0.5">Standard</div>
              <div className="text-xs opacity-75">Yes / No — 1 vote per member</div>
            </button>
            <button
              type="button"
              onClick={() => setVoteMode(1)}
              className={`rounded-xl border-2 px-4 py-3 text-sm font-medium text-left transition-all ${
                voteMode === 1
                  ? "border-purple-500 bg-purple-500/10 text-purple-400"
                  : "border-conclave-border bg-conclave-dark text-conclave-muted hover:border-purple-500/50"
              }`}
            >
              <div className="font-semibold mb-0.5">Quadratic</div>
              <div className="text-xs opacity-75">Voice credits — cost = votes²</div>
            </button>
          </div>
        </div>

        {/* Quadratic config */}
        {voteMode === 1 && (
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-400"></div>
              <span className="text-sm font-medium text-purple-300">Quadratic voting settings</span>
            </div>
            <div>
              <label className="block text-xs text-conclave-muted mb-1">
                Voice credits per member
              </label>
              <input
                type="number"
                value={totalCredits}
                onChange={(e) => setTotalCredits(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={10000}
                className="w-full rounded-lg border border-purple-500/30 bg-conclave-dark px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
              {maxVotes !== null && (
                <p className="text-xs text-conclave-muted mt-1">
                  Max {maxVotes} votes per member (√{totalCredits} = {maxVotes})
                </p>
              )}
            </div>
            <p className="text-xs text-conclave-muted">
              Members allocate up to {totalCredits} credits. Casting k votes costs k² credits — this penalises extreme positions and gives minorities more power.
            </p>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
            {loading ? "Creating…" : "Create proposal"}
          </button>
          <Link href={`/rooms/${roomPda}`} className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
