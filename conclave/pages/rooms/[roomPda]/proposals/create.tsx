"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useConclaveProgram } from "../../../../hooks/useConclaveProgram";
import { getMemberPda, getProposalPda } from "../../../../lib/conclave";

const MAX_TITLE = 100;
const MAX_DESC = 500;

export default function CreateProposalPage() {
  const router = useRouter();
  const { roomPda: roomPdaStr } = router.query;
  const { program, wallet } = useConclaveProgram();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineInput, setDeadlineInput] = useState("");
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

    setLoading(true);
    setError("");
    try {
      const roomPubkey = new PublicKey(roomPda);
      const memberPda = getMemberPda(roomPubkey, wallet.publicKey, program.programId);
      const proposalPda = getProposalPda(roomPubkey, t, program.programId);

      await program.methods
        .createProposal(t, d, new anchor.BN(deadline))
        .accountsPartial({
          creator: wallet.publicKey,
          room: roomPubkey,
          member: memberPda,
          proposal: proposalPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

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
