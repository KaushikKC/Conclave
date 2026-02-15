"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";
import { getRoomPda, getMemberPda } from "../../lib/conclave";
import { generateGroupKey } from "../../app/sdk/crypto";
import { postGroupKey } from "../../lib/api";

const MAX_NAME_LEN = 50;
const GROUP_KEY_STORAGE_PREFIX = "conclave_group_key_";

export default function CreateRoomPage() {
  const router = useRouter();
  const { publicKey: wallet, connected } = useWallet();
  const { program } = useConclaveProgram();
  const [name, setName] = useState("");
  const [governanceMintStr, setGovernanceMintStr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet || !program) {
      setError("Connect your wallet first.");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Room name is required.");
      return;
    }
    if (trimmed.length > MAX_NAME_LEN) {
      setError(`Room name must be ${MAX_NAME_LEN} characters or less.`);
      return;
    }
    let governanceMint: PublicKey;
    try {
      governanceMint = new PublicKey(governanceMintStr.trim());
    } catch {
      setError("Invalid governance mint address.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const roomPda = getRoomPda(wallet, trimmed, program.programId);

      // 1. Create the room
      setStatus("Creating room…");
      await program.methods
        .createRoom(trimmed)
        .accountsPartial({
          authority: wallet,
          governanceMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          room: roomPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2. Generate group key
      const groupKey = generateGroupKey();
      const groupKeyBase64 = btoa(
        String.fromCharCode(...groupKey),
      );

      // 3. Store in localStorage
      localStorage.setItem(
        GROUP_KEY_STORAGE_PREFIX + roomPda.toBase58(),
        JSON.stringify(Array.from(groupKey)),
      );

      // 4. Post to indexer
      setStatus("Saving group key…");
      try {
        await postGroupKey(roomPda.toBase58(), groupKeyBase64);
      } catch {
        // Non-fatal — key is in localStorage, indexer might not be running
      }

      // 5. Auto-join the room
      setStatus("Joining room…");
      try {
        const memberPda = getMemberPda(roomPda, wallet, program.programId);
        const tokenAccount = getAssociatedTokenAddressSync(
          governanceMint,
          wallet,
        );

        await program.methods
          .joinRoom(Array.from(groupKey))
          .accountsPartial({
            wallet,
            room: roomPda,
            tokenAccount,
            member: memberPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch {
        // Non-fatal — user can join from room page
      }

      // 6. Redirect
      router.push(`/rooms/${roomPda.toBase58()}`);
    } catch (err: any) {
      setError(err?.message || err?.toString?.() || "Transaction failed.");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  if (!connected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-conclave-muted mb-4">
          Connect your wallet to create a room.
        </p>
        <Link href="/" className="btn-primary inline-block">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-white mb-2">Create a room</h1>
      <p className="text-conclave-muted mb-6">
        Create a DAO room. Members must hold the governance token to join.
      </p>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Room name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LEN}
            placeholder="e.g. My DAO"
            className="w-full rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none"
          />
          <p className="text-xs text-conclave-muted mt-1">
            {name.length}/{MAX_NAME_LEN}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Governance token mint
          </label>
          <input
            type="text"
            value={governanceMintStr}
            onChange={(e) => setGovernanceMintStr(e.target.value)}
            placeholder="SPL token mint address (e.g. from Realms)"
            className="w-full rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none font-mono text-sm"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {status && <p className="text-conclave-accent text-sm">{status}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create room"}
          </button>
          <Link href="/rooms" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
