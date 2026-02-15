"use client";

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useConclaveProgram } from "../../../../hooks/useConclaveProgram";
import { getMemberPda, getVoteCommitmentPda } from "../../../../lib/conclave";
import { createVoteCommitment } from "../../../../app/sdk/crypto";
import { fetchProposal, fetchProposalVotes } from "../../../../lib/api";

const VOTE_STORAGE_PREFIX = "conclave_vote_";

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
  const { program, wallet } = useConclaveProgram();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voteStatus, setVoteStatus] = useState<
    "none" | "committed" | "revealed"
  >("none");
  const [voteLoading, setVoteLoading] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [error, setError] = useState("");

  const roomPda = typeof roomPdaStr === "string" ? roomPdaStr : null;
  const proposalPda =
    typeof proposalPdaStr === "string" ? proposalPdaStr : null;

  useEffect(() => {
    if (!proposalPda) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProposal(proposalPda);
        if (cancelled) return;
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
        if (!cancelled) setProposal(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalPda]);

  useEffect(() => {
    const pubkey = wallet?.publicKey ?? null;
    if (!proposalPda || !pubkey) return;
    let cancelled = false;
    (async () => {
      try {
        const votes = await fetchProposalVotes(proposalPda);
        const myVote = votes.find((v) => v.voter === pubkey.toBase58());
        if (!cancelled) {
          if (!myVote) setVoteStatus("none");
          else if (myVote.is_revealed) setVoteStatus("revealed");
          else setVoteStatus("committed");
        }
      } catch {
        if (!cancelled) setVoteStatus("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalPda, wallet?.publicKey]);

  const now = Math.floor(Date.now() / 1000);
  const deadlinePassed = proposal ? proposal.deadline <= now : false;

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

      localStorage.setItem(
        VOTE_STORAGE_PREFIX + proposalPda,
        JSON.stringify({ voteChoice, nonce: Array.from(nonce) }),
      );
      setVoteStatus("committed");
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

    const raw = localStorage.getItem(VOTE_STORAGE_PREFIX + proposalPda);
    if (!raw) {
      setError("Stored vote not found. You may have cleared storage.");
      return;
    }
    let voteChoice: number;
    let nonceArr: number[];
    try {
      const parsed = JSON.parse(raw);
      voteChoice = parsed.voteChoice;
      nonceArr = parsed.nonce;
      if (voteChoice !== 0 && voteChoice !== 1)
        throw new Error("Invalid choice");
      if (!Array.isArray(nonceArr) || nonceArr.length !== 32)
        throw new Error("Invalid nonce");
    } catch {
      setError("Invalid stored vote data.");
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
      if (proposal) {
        setProposal({
          ...proposal,
          voteYesCount: proposal.voteYesCount + (voteChoice === 1 ? 1 : 0),
          voteNoCount: proposal.voteNoCount + (voteChoice === 0 ? 1 : 0),
        });
      }
      localStorage.removeItem(VOTE_STORAGE_PREFIX + proposalPda);
    } catch (err: any) {
      setError(err?.message || "Reveal failed");
    } finally {
      setRevealLoading(false);
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
        <h1 className="text-2xl font-bold text-white mb-2">{proposal.title}</h1>
        <p className="text-conclave-muted text-sm mb-4">
          By {proposal.creator.slice(0, 6)}…{proposal.creator.slice(-4)} ·
          Deadline: {new Date(proposal.deadline * 1000).toLocaleString()}
        </p>
        <p className="text-gray-300 whitespace-pre-wrap">
          {proposal.description}
        </p>
      </div>

      <div className="card mb-6">
        <h2 className="font-semibold text-white mb-3">Results</h2>
        <div className="flex gap-6">
          <div>
            <span className="text-conclave-muted text-sm">Yes</span>
            <p className="text-2xl font-bold text-green-400">
              {proposal.voteYesCount}
            </p>
          </div>
          <div>
            <span className="text-conclave-muted text-sm">No</span>
            <p className="text-2xl font-bold text-red-400">
              {proposal.voteNoCount}
            </p>
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {!deadlinePassed && (
        <div className="card">
          <h2 className="font-semibold text-white mb-3">Vote</h2>
          {voteStatus === "none" && (
            <p className="text-conclave-muted text-sm mb-4">
              Your vote is secret until the deadline. Choose below to commit.
            </p>
          )}
          {voteStatus === "committed" && (
            <p className="text-conclave-accent text-sm mb-4">
              Your vote is committed. It will be revealed after the deadline.
            </p>
          )}
          {voteStatus === "none" && wallet?.publicKey && (
            <div className="flex gap-3">
              <button
                onClick={() => handleCastVote(1)}
                disabled={voteLoading}
                className="btn-primary disabled:opacity-50"
              >
                {voteLoading ? "…" : "Vote Yes"}
              </button>
              <button
                onClick={() => handleCastVote(0)}
                disabled={voteLoading}
                className="btn-secondary disabled:opacity-50"
              >
                {voteLoading ? "…" : "Vote No"}
              </button>
            </div>
          )}
        </div>
      )}

      {deadlinePassed && (
        <div className="card">
          <h2 className="font-semibold text-white mb-3">Reveal your vote</h2>
          {voteStatus === "committed" && wallet?.publicKey && (
            <button
              onClick={handleRevealVote}
              disabled={revealLoading}
              className="btn-primary disabled:opacity-50"
            >
              {revealLoading ? "Revealing…" : "Reveal my vote"}
            </button>
          )}
          {voteStatus === "revealed" && (
            <p className="text-conclave-muted text-sm">
              Your vote has been revealed and counted.
            </p>
          )}
          {voteStatus === "none" && (
            <p className="text-conclave-muted text-sm">
              You did not cast a vote on this proposal.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
