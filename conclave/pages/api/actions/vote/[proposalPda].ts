/**
 * Solana Actions (Blinks) endpoint for Conclave proposals.
 *
 * GET  /api/actions/vote/[proposalPda]  → ActionGetResponse (proposal info + vote buttons)
 * POST /api/actions/vote/[proposalPda]?vote=yes|no → ActionPostResponse (cast_vote tx)
 *
 * Any Blinks-compatible client (Dialect, wallet extensions, dial.to) can render
 * a vote card from this URL — no app visit required.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";

const PROGRAM_ID = new PublicKey("E5HrS48LBddCwXGdq4ULPB8bC8rihUReDmu9eRiPQieU");
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const INDEXER_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Solana Actions requires these CORS headers on every response
const ACTION_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-blockchain-ids, x-action-version",
  "X-Action-Version": "2.1.3",
  // devnet chain ID
  "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
};

function setActionHeaders(res: NextApiResponse) {
  Object.entries(ACTION_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

// Anchor discriminator = first 8 bytes of sha256("global:<instruction_name>")
function anchorDiscriminator(name: string): Buffer {
  return Buffer.from(
    createHash("sha256").update(`global:${name}`).digest()
  ).slice(0, 8);
}

function getMemberPda(room: PublicKey, wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), room.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function getVoteCommitmentPda(proposal: PublicKey, voter: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), proposal.toBuffer(), voter.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

async function fetchProposalFromIndexer(proposalPda: string) {
  const res = await fetch(`${INDEXER_URL}/proposals/${proposalPda}`);
  if (!res.ok) throw new Error("Proposal not found");
  return res.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setActionHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { proposalPda } = req.query;
  if (typeof proposalPda !== "string") {
    return res.status(400).json({ message: "Invalid proposal address" });
  }

  // ── GET: Return Blink action metadata ───────────────────────────────────────
  if (req.method === "GET") {
    try {
      const proposal = await fetchProposalFromIndexer(proposalPda);
      const deadlinePassed = proposal.deadline <= Math.floor(Date.now() / 1000);
      const isFinalized = proposal.is_finalized === 1;
      const deadline = new Date(proposal.deadline * 1000).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      if (deadlinePassed || isFinalized) {
        const result =
          proposal.vote_yes_count > proposal.vote_no_count
            ? "PASSED"
            : proposal.vote_no_count > proposal.vote_yes_count
            ? "REJECTED"
            : "TIED";
        return res.status(200).json({
          icon: `${getAppUrl(req)}/logo.png`,
          label: "Voting closed",
          title: proposal.title,
          description: `${proposal.description}\n\nVoting has ended.\nResult: ${result} — ${proposal.vote_yes_count} Yes / ${proposal.vote_no_count} No`,
          disabled: true,
          error: { message: "Voting period has ended" },
        });
      }

      return res.status(200).json({
        icon: `${getAppUrl(req)}/logo.png`,
        label: "Vote on proposal",
        title: proposal.title,
        description: [
          proposal.description,
          "",
          `Deadline: ${deadline}`,
          `Current tally: ${proposal.vote_yes_count} Yes / ${proposal.vote_no_count} No (votes revealed so far)`,
          "",
          "Your vote is committed as a hash — no one can see your choice until the deadline.",
        ].join("\n"),
        links: {
          actions: [
            {
              label: "Vote Yes",
              href: `/api/actions/vote/${proposalPda}?vote=yes`,
            },
            {
              label: "Vote No",
              href: `/api/actions/vote/${proposalPda}?vote=no`,
            },
          ],
        },
      });
    } catch (err: any) {
      return res.status(404).json({ message: err.message || "Proposal not found" });
    }
  }

  // ── POST: Build a cast_vote transaction ─────────────────────────────────────
  if (req.method === "POST") {
    const { vote } = req.query;
    const { account } = req.body;

    if (!account || typeof account !== "string") {
      return res.status(400).json({ message: "Missing account in request body" });
    }
    if (vote !== "yes" && vote !== "no") {
      return res.status(400).json({ message: "Invalid vote: must be yes or no" });
    }

    try {
      const proposal = await fetchProposalFromIndexer(proposalPda);

      if (proposal.deadline <= Math.floor(Date.now() / 1000)) {
        return res.status(400).json({ message: "Voting deadline has passed" });
      }

      const voteChoice = vote === "yes" ? 1 : 0;

      // Generate commitment server-side
      // commitment = sha256(vote_choice_byte || nonce_32_bytes)
      const nonce = randomBytes(32);
      const preimage = Buffer.alloc(33);
      preimage[0] = voteChoice;
      nonce.copy(preimage, 1);
      const commitment = createHash("sha256").update(preimage).digest();

      // Store nonce in indexer so the user can retrieve it for the reveal phase
      const voteDataPayload = JSON.stringify({
        voteChoice,
        nonce: Array.from(nonce),
      });
      await fetch(`${INDEXER_URL}/votes/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: proposalPda,
          voter: account,
          encryptedData: voteDataPayload, // stored unencrypted (Blink context has no group key)
        }),
      }).catch(() => {}); // non-fatal

      // Build the cast_vote instruction manually
      const voterPubkey = new PublicKey(account);
      const proposalPubkey = new PublicKey(proposalPda);
      const roomPubkey = new PublicKey(proposal.room);
      const memberPda = getMemberPda(roomPubkey, voterPubkey);
      const voteCommitmentPda = getVoteCommitmentPda(proposalPubkey, voterPubkey);

      // Instruction data: [8-byte discriminator] + [32-byte commitment]
      const discriminator = anchorDiscriminator("cast_vote");
      const instructionData = Buffer.concat([discriminator, commitment]);

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: voterPubkey, isSigner: true, isWritable: true },
          { pubkey: roomPubkey, isSigner: false, isWritable: false },
          { pubkey: memberPda, isSigner: false, isWritable: false },
          { pubkey: proposalPubkey, isSigner: false, isWritable: false },
          { pubkey: voteCommitmentPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      const connection = new Connection(RPC_URL, "confirmed");
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");

      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = voterPubkey;
      tx.add(ix);

      // Serialize without requiring all signatures — wallet will sign
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const deadline = new Date(proposal.deadline * 1000).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      return res.status(200).json({
        transaction: serialized.toString("base64"),
        message: `Vote committed anonymously! Open Conclave to reveal your vote after the deadline: ${deadline}`,
      });
    } catch (err: any) {
      console.error("[Blink] POST error:", err);
      return res.status(500).json({ message: err.message || "Failed to build transaction" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}

function getAppUrl(req: NextApiRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = req.headers.host || "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
