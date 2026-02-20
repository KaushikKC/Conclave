"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";
import { getRoomPda, getMemberPda } from "../../lib/conclave";
import { generateGroupKey } from "../../app/sdk/crypto";
import { postGroupKeyWithRetry, postRoomRealm, pushRoomToIndexer, pushMemberToIndexer } from "../../lib/api";
import { fetchRealmInfo, verifyRealmsMembership } from "../../app/sdk/realms";

const MAX_NAME_LEN = 50;
const GROUP_KEY_STORAGE_PREFIX = "conclave_group_key_";

type MintMode = "realms" | "custom";

export default function CreateRoomPage() {
  const router = useRouter();
  const { publicKey: wallet, connected } = useWallet();
  const { connection } = useConnection();
  const { program } = useConclaveProgram();
  const [name, setName] = useState("");
  const [governanceMintStr, setGovernanceMintStr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Realms integration state
  const [mintMode, setMintMode] = useState<MintMode>("realms");
  const [realmAddressStr, setRealmAddressStr] = useState("");
  const [realmName, setRealmName] = useState("");
  const [realmVerified, setRealmVerified] = useState(false);
  const [realmLoading, setRealmLoading] = useState(false);
  const [realmError, setRealmError] = useState("");

  const handleLookupRealm = async () => {
    if (!wallet) {
      setRealmError("Connect your wallet first.");
      return;
    }
    const trimmed = realmAddressStr.trim();
    if (!trimmed) {
      setRealmError("Enter a Realm address.");
      return;
    }
    let realmPubkey: PublicKey;
    try {
      realmPubkey = new PublicKey(trimmed);
    } catch {
      setRealmError("Invalid Realm address.");
      return;
    }

    setRealmLoading(true);
    setRealmError("");
    setRealmVerified(false);
    setRealmName("");
    try {
      const info = await fetchRealmInfo(connection, realmPubkey);
      if (!info) {
        setRealmError("Realm not found. Check the address and network.");
        return;
      }
      setRealmName(info.name);
      setGovernanceMintStr(info.communityMint.toBase58());

      // Verify membership
      const membership = await verifyRealmsMembership(
        connection,
        realmPubkey,
        info.communityMint,
        wallet,
      );
      setRealmVerified(membership !== null && membership.governingTokenDepositAmount.gtn(0));
    } catch (err: any) {
      setRealmError(err?.message || "Failed to fetch Realm info.");
    } finally {
      setRealmLoading(false);
    }
  };

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
      setStatus("Creating room...");
      const sig = await program.methods
        .createRoom(trimmed)
        .accountsPartial({
          authority: wallet,
          governanceMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          room: roomPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2. Wait for tx confirmation before posting key
      setStatus("Confirming transaction...");
      await connection.confirmTransaction(sig, "confirmed");

      // 2b. Push room data directly to indexer (no RPC needed — avoids rate limits)
      const timestamp = Math.floor(Date.now() / 1000);
      await pushRoomToIndexer(
        roomPda.toBase58(),
        wallet.toBase58(),
        governanceMint.toBase58(),
        trimmed,
        timestamp,
      );

      // 2c. Link realm address if using Realms mode
      if (mintMode === "realms" && realmAddressStr.trim()) {
        const realmAddr = realmAddressStr.trim();
        // Store in localStorage so room detail page can always find it
        localStorage.setItem(`conclave_realm_${roomPda.toBase58()}`, realmAddr);
        // Small delay to let indexer DB commit the room row
        await new Promise((r) => setTimeout(r, 1000));
        await postRoomRealm(roomPda.toBase58(), realmAddr);
      }

      // 3. Generate group key
      const groupKey = generateGroupKey();
      const groupKeyBase64 = btoa(String.fromCharCode(...groupKey));

      // 4. Store in localStorage
      localStorage.setItem(
        GROUP_KEY_STORAGE_PREFIX + roomPda.toBase58(),
        JSON.stringify(Array.from(groupKey)),
      );

      // 5. Auto-publish room key to indexer with retries (handles devnet propagation delay)
      setStatus("Saving group key...");
      try {
        await postGroupKeyWithRetry(roomPda.toBase58(), groupKeyBase64);
      } catch (err) {
        console.warn("Failed to publish group key after retries:", err);
        setError("Room created, but key publish failed. It will auto-retry when you visit the room.");
      }

      // 6. Auto-join the room
      setStatus("Joining room...");
      try {
        const memberPda = getMemberPda(roomPda, wallet, program.programId);
        const tokenAccount = getAssociatedTokenAddressSync(
          governanceMint,
          wallet,
        );

        // Create the ATA if it doesn't exist
        const preInstructions = [];
        const ataInfo = await connection.getAccountInfo(tokenAccount);
        if (!ataInfo) {
          preInstructions.push(
            createAssociatedTokenAccountInstruction(
              wallet,
              tokenAccount,
              wallet,
              governanceMint,
            ),
          );
        }

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
          .preInstructions(preInstructions)
          .rpc();
        // Push member data directly to indexer (no RPC needed)
        await pushMemberToIndexer(
          memberPda.toBase58(),
          wallet.toBase58(),
          roomPda.toBase58(),
          Math.floor(Date.now() / 1000),
        );
      } catch {
        // Non-fatal — user can join from room page
      }

      // 7. Redirect
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
        Create a DAO room linked to your Realms governance or any SPL token.
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

        {/* Mode selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Governance token source
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMintMode("realms"); setError(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                mintMode === "realms"
                  ? "bg-conclave-accent/20 border border-conclave-accent text-conclave-accent"
                  : "border border-conclave-border text-conclave-muted hover:text-white"
              }`}
            >
              Realms DAO
            </button>
            <button
              type="button"
              onClick={() => { setMintMode("custom"); setError(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                mintMode === "custom"
                  ? "bg-conclave-accent/20 border border-conclave-accent text-conclave-accent"
                  : "border border-conclave-border text-conclave-muted hover:text-white"
              }`}
            >
              Custom token
            </button>
          </div>
        </div>

        {/* Realms DAO mode */}
        {mintMode === "realms" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Realm address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={realmAddressStr}
                  onChange={(e) => {
                    setRealmAddressStr(e.target.value);
                    setRealmVerified(false);
                    setRealmName("");
                    setRealmError("");
                    setGovernanceMintStr("");
                  }}
                  placeholder="Realms DAO address (from app.realms.today)"
                  className="flex-1 rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={handleLookupRealm}
                  disabled={realmLoading}
                  className="btn-secondary text-sm whitespace-nowrap disabled:opacity-50"
                >
                  {realmLoading ? "Looking up..." : "Lookup"}
                </button>
              </div>
            </div>

            {realmError && (
              <p className="text-red-400 text-sm">{realmError}</p>
            )}

            {realmName && (
              <div className="rounded-lg border border-conclave-border bg-conclave-dark/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
                    Realms DAO
                  </span>
                  <span className="text-white font-medium">{realmName}</span>
                </div>
                <p className="text-xs text-conclave-muted font-mono truncate">
                  Community mint: {governanceMintStr}
                </p>
                {realmVerified ? (
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                    Verified Realms DAO member
                  </p>
                ) : (
                  <p className="text-xs text-yellow-400 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-400"></span>
                    Not a member of this Realm (you can still create the room)
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Custom token mode */}
        {mintMode === "custom" && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Governance token mint
            </label>
            <input
              type="text"
              value={governanceMintStr}
              onChange={(e) => setGovernanceMintStr(e.target.value)}
              placeholder="SPL token mint address"
              className="w-full rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none font-mono text-sm"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {status && <p className="text-conclave-accent text-sm">{status}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || (mintMode === "realms" && !governanceMintStr)}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create room"}
          </button>
          <Link href="/rooms" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
