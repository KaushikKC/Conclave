"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  MintLayout,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  withCreateRealm,
  withDepositGoverningTokens,
  MintMaxVoteWeightSource,
  getGovernanceProgramVersion,
} from "@realms-today/spl-governance";
import BN from "bn.js";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";
import { getRoomPda, getMemberPda } from "../../lib/conclave";
import { generateGroupKey } from "../../app/sdk/crypto";
import { postGroupKeyWithRetry, postRoomRealm, pushRoomToIndexer, pushMemberToIndexer } from "../../lib/api";
import { fetchRealmInfo, verifyRealmsMembership, SPL_GOVERNANCE_PROGRAM_ID } from "../../app/sdk/realms";

const MAX_NAME_LEN = 50;
const GROUP_KEY_STORAGE_PREFIX = "conclave_group_key_";

type MintMode = "realms" | "custom";

export default function CreateRoomPage() {
  const router = useRouter();
  const { publicKey: wallet, connected, signTransaction } = useWallet();
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

  // Create Realm state
  const [showCreateRealm, setShowCreateRealm] = useState(false);
  const [createRealmName, setCreateRealmName] = useState("");
  const [createRealmLoading, setCreateRealmLoading] = useState(false);
  const [createRealmStatus, setCreateRealmStatus] = useState("");
  const [createRealmError, setCreateRealmError] = useState("");

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

  const handleCreateRealm = async () => {
    if (!wallet || !connected || !signTransaction) {
      setCreateRealmError("Connect your wallet first.");
      return;
    }
    const daoName = createRealmName.trim() || `${name.trim() || "My DAO"} Realm`;
    setCreateRealmLoading(true);
    setCreateRealmError("");
    setCreateRealmStatus("");

    try {
      // Step 1: Get governance program version
      setCreateRealmStatus("Preparing...");
      const programVersion = await getGovernanceProgramVersion(connection, SPL_GOVERNANCE_PROGRAM_ID);

      // Step 2: Create governance token + Realm in one transaction (1/2)
      setCreateRealmStatus("Creating governance token and Realm (1/2)...");
      const mintKeypair = Keypair.generate();
      const mintRent = await connection.getMinimumBalanceForRentExemption(MintLayout.span);
      const ata = getAssociatedTokenAddressSync(mintKeypair.publicKey, wallet);

      const tx1 = new Transaction();
      // Mint creation instructions
      tx1.add(
        SystemProgram.createAccount({
          fromPubkey: wallet,
          newAccountPubkey: mintKeypair.publicKey,
          lamports: mintRent,
          space: MintLayout.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mintKeypair.publicKey, 6, wallet, null),
        createAssociatedTokenAccountInstruction(wallet, ata, wallet, mintKeypair.publicKey),
        createMintToInstruction(mintKeypair.publicKey, ata, wallet, BigInt(1_000_000 * 1e6)),
      );
      // Realm creation instructions appended to same transaction
      const createRealmIxs: any[] = [];
      const realmAddress = await withCreateRealm(
        createRealmIxs,
        SPL_GOVERNANCE_PROGRAM_ID,
        programVersion,
        daoName,
        wallet,
        mintKeypair.publicKey,
        wallet,
        undefined,
        MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
        new BN(1) as any,
        undefined,
        undefined,
      );
      tx1.add(...createRealmIxs);
      tx1.feePayer = wallet;
      const { blockhash: bh1, lastValidBlockHeight: lbh1 } = await connection.getLatestBlockhash("confirmed");
      tx1.recentBlockhash = bh1;
      tx1.partialSign(mintKeypair);
      const signedTx1 = await signTransaction(tx1);
      const sig1 = await connection.sendRawTransaction(signedTx1.serialize());
      await connection.confirmTransaction({ signature: sig1, blockhash: bh1, lastValidBlockHeight: lbh1 }, "confirmed");

      // Step 3: Deposit governing tokens — become a Realm member (2/2)
      setCreateRealmStatus("Joining as member (2/2)...");
      const depositIxs: any[] = [];
      await withDepositGoverningTokens(
        depositIxs,
        SPL_GOVERNANCE_PROGRAM_ID,
        programVersion,
        realmAddress,
        ata,
        mintKeypair.publicKey,
        wallet,
        wallet,
        wallet,
        new BN(100_000 * 1e6) as any,
      );
      const tx2 = new Transaction().add(...depositIxs);
      tx2.feePayer = wallet;
      const { blockhash: bh2, lastValidBlockHeight: lbh2 } = await connection.getLatestBlockhash("confirmed");
      tx2.recentBlockhash = bh2;
      const signedTx2 = await signTransaction(tx2);
      const sig2 = await connection.sendRawTransaction(signedTx2.serialize());
      await connection.confirmTransaction({ signature: sig2, blockhash: bh2, lastValidBlockHeight: lbh2 }, "confirmed");

      // Auto-fill realm address and lookup info
      setCreateRealmStatus("");
      setCreateRealmName("");
      setShowCreateRealm(false);
      setRealmAddressStr(realmAddress.toBase58());
      setGovernanceMintStr(mintKeypair.publicKey.toBase58());
      setRealmName(daoName);
      setRealmVerified(true);
    } catch (err: any) {
      setCreateRealmError(err?.message || "Failed to create Realm.");
      setCreateRealmStatus("");
    } finally {
      setCreateRealmLoading(false);
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
    <div className="max-w-2xl mx-auto px-6 py-16 relative">
      {/* Background blobs */}
      <div className="absolute top-0 -left-64 w-96 h-96 bg-conclave-pink/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob z-0 pointer-events-none"></div>
      <div className="absolute bottom-0 -right-64 w-96 h-96 bg-conclave-blue/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000 z-0 pointer-events-none"></div>

      <div className="relative z-10 text-center mb-12">
        <h1 className="text-4xl font-black text-conclave-text uppercase tracking-widest mb-4 inline-flex items-center gap-4">
          <div className="w-3 h-3 bg-conclave-pink rounded-full shadow-[0_0_15px_rgba(255,77,141,0.8)] animate-pulse"></div>
          Create Workspace
        </h1>
        <p className="text-sm text-conclave-textMuted uppercase tracking-widest font-medium max-w-md mx-auto leading-relaxed">
          Create an encrypted DAO room linked to your Realms governance or any SPL token.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative z-10 rounded-3xl border border-white/10 bg-conclave-card/60 p-8 sm:p-12 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] space-y-8">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-conclave-text/80 mb-3">
            Room name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LEN}
            placeholder="e.g. Core Contributors"
            className="w-full rounded-xl border border-white/10 bg-black/50 px-5 py-4 text-white placeholder-conclave-textMuted focus:border-conclave-pink focus:shadow-[0_0_20px_rgba(255,77,141,0.2)] focus:outline-none transition-all font-medium text-lg"
          />
          <p className="text-[10px] text-conclave-textMuted mt-2 uppercase tracking-widest text-right">
            {name.length} / {MAX_NAME_LEN}
          </p>
        </div>

        {/* Mode selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-conclave-text/80 mb-3">
            Governance Token Source
          </label>
          <div className="flex bg-black/50 p-1.5 rounded-xl border border-white/5 relative">
            <button
              type="button"
              onClick={() => { setMintMode("realms"); setError(""); }}
              className={`flex-1 px-4 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${mintMode === "realms"
                ? "bg-conclave-pink/10 border border-conclave-pink/20 text-conclave-pink shadow-[0_0_15px_rgba(255,77,141,0.2)]"
                : "border border-transparent text-conclave-textMuted hover:text-white hover:bg-white/5"
                }`}
            >
              Realms DAO
            </button>
            <button
              type="button"
              onClick={() => { setMintMode("custom"); setError(""); }}
              className={`flex-1 px-4 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${mintMode === "custom"
                ? "bg-conclave-pink/10 border border-conclave-pink/20 text-conclave-pink shadow-[0_0_15px_rgba(255,77,141,0.2)]"
                : "border border-transparent text-conclave-textMuted hover:text-white hover:bg-white/5"
                }`}
            >
              Custom token
            </button>
          </div>
        </div>

        {/* Realms DAO mode */}
        {mintMode === "realms" && (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-conclave-text/80 mb-3">
                Realm Address
              </label>
              <div className="flex gap-3">
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
                  placeholder="Realm address from app.realms.today"
                  className="flex-1 rounded-xl border border-white/10 bg-black/50 px-5 py-3 text-white placeholder-conclave-textMuted focus:border-conclave-blue focus:shadow-[0_0_20px_rgba(0,184,241,0.2)] focus:outline-none font-mono text-sm transition-all"
                />
                <button
                  type="button"
                  onClick={handleLookupRealm}
                  disabled={realmLoading}
                  className="btn-secondary whitespace-nowrap disabled:opacity-50 !py-3 !px-6 border-conclave-blue/50 text-conclave-blue hover:bg-conclave-blue/10 hover:border-conclave-blue"
                >
                  {realmLoading ? "Looking up..." : "Link Realm"}
                </button>
              </div>
            </div>

            {realmError && (
              <p className="text-red-400 text-sm">{realmError}</p>
            )}

            {/* Create Realm on Devnet */}
            <div className="rounded-xl border border-conclave-pink/20 bg-conclave-pink/5 p-5 transition-all">
              <button
                type="button"
                onClick={() => { setShowCreateRealm(!showCreateRealm); setCreateRealmError(""); }}
                className="flex items-center justify-between w-full text-xs font-bold uppercase tracking-widest text-conclave-pink hover:text-white transition"
              >
                <span>No Realm? Create on Devnet</span>
                <span className="text-[10px] transform transition-transform" style={{ rotate: showCreateRealm ? '180deg' : '0deg' }}>▼</span>
              </button>

              {showCreateRealm && (
                <div className="mt-5 space-y-5 animate-fadeIn">
                  <p className="text-[10px] uppercase tracking-widest text-conclave-textMuted leading-relaxed">
                    Deploys a new Realms DAO with a governance token.
                    Requires 2 transactions. Auto-links generated Realm.
                  </p>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-conclave-text/80 mb-2">DAO Name (Optional)</label>
                    <input
                      type="text"
                      value={createRealmName}
                      onChange={(e) => setCreateRealmName(e.target.value)}
                      placeholder={name.trim() ? `${name.trim()} Realm` : "My DAO Realm"}
                      className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-white placeholder-conclave-textMuted focus:border-conclave-pink focus:outline-none text-sm transition-all focus:shadow-[0_0_15px_rgba(255,77,141,0.2)]"
                    />
                  </div>
                  {createRealmError && (
                    <p className="text-red-400 text-[10px] uppercase tracking-wider">{createRealmError}</p>
                  )}
                  {createRealmStatus && (
                    <p className="text-conclave-blue text-[10px] uppercase tracking-wider animate-pulse">{createRealmStatus}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleCreateRealm}
                    disabled={createRealmLoading}
                    className="btn-primary w-full shadow-[0_0_20px_rgba(255,77,141,0.2)]"
                  >
                    {createRealmLoading ? createRealmStatus || "Creating..." : "Deploy Realm"}
                  </button>
                </div>
              )}
            </div>

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
          <div className="animate-fadeIn">
            <label className="block text-xs font-bold uppercase tracking-widest text-conclave-text/80 mb-3">
              Governance Token Mint
            </label>
            <input
              type="text"
              value={governanceMintStr}
              onChange={(e) => setGovernanceMintStr(e.target.value)}
              placeholder="SPL token mint address"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-5 py-4 text-white placeholder-conclave-textMuted focus:border-conclave-yellow focus:shadow-[0_0_20px_rgba(255,200,0,0.2)] focus:outline-none font-mono text-sm transition-all"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-[10px] uppercase tracking-wider bg-red-500/10 border border-red-500/20 p-3 rounded-lg">{error}</p>}
        {status && <p className="text-conclave-blue text-[10px] uppercase tracking-wider bg-conclave-blue/10 border border-conclave-blue/20 p-3 rounded-lg animate-pulse">{status}</p>}

        <div className="flex flex-col sm:flex-row gap-4 pt-6 mt-4 border-t border-white/10">
          <button
            type="submit"
            disabled={loading || (mintMode === "realms" && !governanceMintStr)}
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(237,224,212,0.1)]"
          >
            {loading ? "Creating Workspace..." : "Initialize Workspace"}
          </button>
          <Link href="/rooms" className="btn-secondary !px-10 text-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
