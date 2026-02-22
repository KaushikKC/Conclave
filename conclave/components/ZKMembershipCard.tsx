"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { postZKIdentity, fetchZKGroup } from "../lib/api";

const TREE_DEPTH = 16;
const PSE_CDN = "https://www.trusted-setup-pse.org/semaphore";
const IDENTITY_KEY_PREFIX = "conclave_zk_id_";

interface Props {
  roomPda: string;
  isMember: boolean;
}

type Step = "none" | "registered" | "proved";

interface ZKProofDisplay {
  merkleTreeRoot: string;
  nullifierHash: string;
  externalNullifier: string;
  // v3 packs the Groth16 proof into a flat string[8]: [a0,a1, b01,b00,b11,b10, c0,c1]
  proof: string[];
  verified: boolean;
}

/** Convert a base58 roomPda string into a BigInt suitable as an externalNullifier */
function roomPdaToExternalNullifier(roomPda: string): bigint {
  const bytes = new TextEncoder().encode(roomPda).slice(0, 8);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return BigInt("0x" + hex);
}

/** Shorten a very long decimal/hex string for display */
function shortHex(s: string, chars = 12): string {
  if (s.length <= chars * 2 + 3) return s;
  return s.slice(0, chars) + "..." + s.slice(-chars);
}

export default function ZKMembershipCard({ roomPda, isMember }: Props) {
  const { signMessage } = useWallet();
  const [step, setStep] = useState<Step>("none");
  const [commitment, setCommitment] = useState<string>("");
  const [groupSize, setGroupSize] = useState<number>(0);
  const [proofDisplay, setProofDisplay] = useState<ZKProofDisplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [verifyPaste, setVerifyPaste] = useState("");
  const [verifyResult, setVerifyResult] = useState<"idle" | "valid" | "invalid" | "error">("idle");
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Load existing identity from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(IDENTITY_KEY_PREFIX + roomPda);
    if (stored) {
      // Reconstruct commitment from seed via dynamic import (avoid SSR)
      import("@semaphore-protocol/identity").then(({ Identity }) => {
        try {
          const identity = new Identity(stored);
          setCommitment(identity.commitment.toString());
          setStep("registered");
        } catch {
          localStorage.removeItem(IDENTITY_KEY_PREFIX + roomPda);
        }
      });
    }
    fetchZKGroup(roomPda).then((c) => setGroupSize(c.length));
  }, [roomPda]);

  const handleRegister = useCallback(async () => {
    if (!signMessage) {
      setError("Your wallet doesn't support message signing.");
      return;
    }
    setLoading(true);
    setError("");
    setStatus("Waiting for wallet signature...");
    try {
      // Sign a deterministic message — same wallet + room always produces the same identity
      const msg = new TextEncoder().encode(
        `Conclave ZK Identity v1\nRoom: ${roomPda}`,
      );
      const sig = await signMessage(msg);

      // Hex-encode signature as seed → deterministic identity per wallet+room
      const seed = Array.from(sig)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      setStatus("Generating Semaphore identity...");
      const { Identity } = await import("@semaphore-protocol/identity");
      const identity = new Identity(seed);

      setStatus("Registering commitment on-chain...");
      await postZKIdentity(roomPda, identity.commitment.toString());

      // Persist seed so same identity can be recovered without re-signing
      localStorage.setItem(IDENTITY_KEY_PREFIX + roomPda, seed);
      setCommitment(identity.commitment.toString());
      setGroupSize((prev) => prev + 1);
      setStep("registered");
      setStatus("");
    } catch (err: any) {
      setError(err?.message || "Registration failed.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }, [signMessage, roomPda]);

  const handleProve = useCallback(async () => {
    const stored = localStorage.getItem(IDENTITY_KEY_PREFIX + roomPda);
    if (!stored) {
      setError("No local identity found. Please register first.");
      return;
    }
    setLoading(true);
    setError("");
    setStatus("Fetching group members...");
    try {
      const commitments = await fetchZKGroup(roomPda);
      if (commitments.length === 0) {
        setError("Group is empty — register at least one member first.");
        return;
      }
      if (!commitments.includes(commitment)) {
        setError("Your commitment is not in this group. Re-register to add it.");
        return;
      }

      // Dynamic imports — avoid SSR, load only when needed
      const [{ Identity }, { Group }, { generateProof, verifyProof }] =
        await Promise.all([
          import("@semaphore-protocol/identity"),
          import("@semaphore-protocol/group"),
          import("@semaphore-protocol/proof"),
        ]);

      const identity = new Identity(stored);
      const group = new Group(1, TREE_DEPTH);
      for (const c of commitments) {
        group.addMember(BigInt(c));
      }

      const externalNullifier = roomPdaToExternalNullifier(roomPda);
      // Signal: BigInt 1 = "I attest membership"
      const signal = BigInt(1);

      setStatus(
        `Generating Groth16 ZK proof... First time fetches ~28 MB circuit artifacts from PSE CDN — may take 30-60 seconds.`,
      );

      const fullProof = await generateProof(
        identity,
        group,
        externalNullifier,
        signal,
        {
          zkeyFilePath: `${PSE_CDN}/${TREE_DEPTH}/semaphore.zkey`,
          wasmFilePath: `${PSE_CDN}/${TREE_DEPTH}/semaphore.wasm`,
        },
      );

      setStatus("Verifying proof locally...");
      let verified = false;
      try {
        verified = await verifyProof(fullProof, TREE_DEPTH);
      } catch {
        // verifyProof may fail if vkey fetch fails; treat as unverified rather than crashing
        verified = false;
      }

      setProofDisplay({
        // coerce bigint → string (v3 returns bigint for these fields)
        merkleTreeRoot: fullProof.merkleTreeRoot.toString(),
        nullifierHash: fullProof.nullifierHash.toString(),
        externalNullifier: fullProof.externalNullifier.toString(),
        proof: fullProof.proof as unknown as string[],
        verified,
      });
      setStep("proved");
      setStatus("");
    } catch (err: any) {
      setError(err?.message || "Proof generation failed.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }, [commitment, roomPda]);

  const handleReset = () => {
    localStorage.removeItem(IDENTITY_KEY_PREFIX + roomPda);
    setStep("none");
    setCommitment("");
    setProofDisplay(null);
    setError("");
    setStatus("");
  };

  const handleVerifyProof = useCallback(async () => {
    if (!verifyPaste.trim()) {
      setVerifyResult("error");
      return;
    }
    setVerifyLoading(true);
    setVerifyResult("idle");
    try {
      const payload = JSON.parse(verifyPaste.trim()) as {
        roomPda?: string;
        merkleTreeRoot: string;
        nullifierHash: string;
        externalNullifier: string;
        signal?: string;
        proof: string[];
      };
      const { verifyProof: semaphoreVerify } = await import("@semaphore-protocol/proof");
      const proofArr = Array.isArray(payload.proof) && payload.proof.length >= 8
        ? (payload.proof.slice(0, 8) as [string, string, string, string, string, string, string, string])
        : payload.proof;
      const fullProof = {
        merkleTreeRoot: BigInt(payload.merkleTreeRoot),
        nullifierHash: BigInt(payload.nullifierHash),
        externalNullifier: BigInt(payload.externalNullifier),
        signal: payload.signal ?? "1",
        proof: proofArr,
      };
      const valid = await semaphoreVerify(fullProof as import("@semaphore-protocol/proof").SemaphoreProof, TREE_DEPTH);
      setVerifyResult(valid ? "valid" : "invalid");
    } catch {
      setVerifyResult("error");
    } finally {
      setVerifyLoading(false);
    }
  }, [verifyPaste]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="rounded-3xl border border-white/5 bg-black/40 p-6 sm:p-8 backdrop-blur-xl shadow-inner relative overflow-hidden group hover:border-violet-500/20 transition-all">
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500/10 rounded-full mix-blend-screen filter blur-[50px] z-0 pointer-events-none group-hover:bg-violet-500/20 transition-all duration-500"></div>
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] px-3 py-1 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30 font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(139,92,246,0.2)]">
                ZK — Groth16
              </span>
              <h3 className="font-black text-white uppercase tracking-widest text-lg">Anonymous Membership Proof</h3>
            </div>
          </div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed mb-6 max-w-2xl">
            Prove you hold governance tokens <span className="text-white">without revealing your wallet</span>.
            Uses a Semaphore Poseidon Merkle circuit — a real Groth16 zero-knowledge proof generated entirely in your browser.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center shadow-inner">
              <p className="text-2xl font-black text-white mb-1 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">{groupSize}</p>
              <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted">ZK Members</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center shadow-inner">
              <p className="text-lg font-black text-white mb-1 uppercase tracking-widest mt-1">Groth16</p>
              <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted mt-2">Proof System</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center shadow-inner hidden sm:block">
              <p className="text-lg font-black text-white mb-1 uppercase tracking-widest mt-1">Poseidon</p>
              <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted mt-2">Hash Function</p>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1 — Register Identity */}
      <div className={`rounded-3xl border transition-all duration-500 p-6 sm:p-8 backdrop-blur-xl shadow-inner relative overflow-hidden ${step === "none"
          ? "border-violet-500/30 bg-gradient-to-br from-violet-900/10 to-black/40 shadow-[0_0_30px_rgba(139,92,246,0.05)]"
          : "border-white/5 bg-black/40 opacity-70 hover:opacity-100"
        }`}>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-inner ${step !== "none"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-violet-500/20 text-violet-400 border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
              }`}>
              {step !== "none" ? "✓" : "1"}
            </div>
            <h4 className="text-sm font-black text-white uppercase tracking-widest">Generate ZK Identity</h4>
          </div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted pl-12 mb-6 leading-relaxed max-w-2xl">
            Sign a message to derive your anonymous Semaphore identity. Your wallet signature is hashed — the on-chain commitment reveals nothing about which wallet you used.
          </p>

          <div className="pl-12">
            {step === "none" ? (
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <button
                  onClick={handleRegister}
                  disabled={loading || !isMember}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600/80 to-violet-400/80 hover:from-violet-500 hover:to-violet-300 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:grayscale shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                  title={!isMember ? "You must be a room member first" : ""}
                >
                  {loading && status.includes("identity")
                    ? "Generating..."
                    : "Generate & Register Identity"}
                </button>
                {!isMember && (
                  <span className="text-[9px] uppercase font-bold tracking-widest text-conclave-yellow bg-conclave-yellow/10 px-3 py-1.5 rounded-lg border border-conclave-yellow/20">
                    Join the room first
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-green-400 bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  Identity Registered
                </div>
                <div className="rounded-2xl bg-black/60 border border-white/5 p-4 max-w-2xl shadow-inner">
                  <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted mb-2">Your commitment (public, unlinkable)</p>
                  <p className="text-xs font-mono text-violet-300 break-all bg-white/5 p-3 rounded-xl border border-white/5">
                    {shortHex(commitment, 20)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step 2 — Generate ZK Proof */}
      <div className={`rounded-3xl border transition-all duration-500 p-6 sm:p-8 backdrop-blur-xl shadow-inner relative overflow-hidden ${step === "registered"
          ? "border-violet-500/30 bg-gradient-to-br from-violet-900/10 to-black/40 shadow-[0_0_30px_rgba(139,92,246,0.05)]"
          : step === "proved"
            ? "border-green-500/20 bg-gradient-to-br from-green-900/10 to-black/40"
            : "border-white/5 bg-black/40 opacity-50 grayscale"
        }`}>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-inner transition-colors ${step === "proved"
                ? "bg-green-500/20 text-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(74,222,128,0.2)]"
                : step === "registered"
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                  : "bg-white/5 text-conclave-textMuted border border-white/10"
              }`}>
              {step === "proved" ? "✓" : "2"}
            </div>
            <h4 className="text-sm font-black text-white uppercase tracking-widest">Prove Membership</h4>
          </div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted pl-12 mb-6 leading-relaxed max-w-2xl">
            Generate a Groth16 proof that your commitment is a leaf in the group&apos;s Poseidon Merkle tree — without revealing <em>which</em> leaf.
          </p>

          <div className="pl-12">
            {step === "registered" && (
              <div>
                <button
                  onClick={handleProve}
                  disabled={loading}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600/80 to-violet-400/80 hover:from-violet-500 hover:to-violet-300 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:grayscale shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                >
                  {loading ? "Generating..." : "Generate ZK Proof"}
                </button>
                <div className="mt-4 inline-block bg-black/40 rounded-xl border border-white/5 p-3">
                  <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-conclave-pink rounded-full"></span>
                    First run downloads circuit artifacts (~28 MB) from PSE. Cached on reload.
                  </p>
                </div>
              </div>
            )}

            {step === "proved" && proofDisplay && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  {proofDisplay.verified ? (
                    <span className="text-[10px] px-3 py-1.5 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 font-bold uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Proof Valid ✓
                    </span>
                  ) : (
                    <span className="text-[10px] px-3 py-1.5 rounded-xl bg-yellow-500/10 text-conclave-yellow border border-yellow-500/20 font-bold uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-conclave-yellow animate-pulse"></span> Proof Generated
                    </span>
                  )}
                  <button
                    onClick={handleProve}
                    disabled={loading}
                    className="text-[9px] uppercase font-bold tracking-widest text-violet-400 hover:text-white transition-colors bg-violet-500/10 px-3 py-1.5 rounded-xl border border-violet-500/20 hover:bg-violet-500/20"
                  >
                    Regenerate
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl">
                  <div className="rounded-2xl bg-black/60 border border-white/5 p-4 shadow-inner">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted mb-2">Merkle Root (state)</p>
                    <p className="font-mono text-xs text-violet-300 break-all bg-white/5 p-2 rounded-lg">
                      {shortHex(proofDisplay.merkleTreeRoot, 16)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/60 border border-white/5 p-4 shadow-inner">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted mb-2">Nullifier Hash</p>
                    <p className="font-mono text-xs text-violet-300 break-all bg-white/5 p-2 rounded-lg">
                      {shortHex(proofDisplay.nullifierHash, 16)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/60 border border-white/5 p-4 shadow-inner">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted mb-2">π_A (packed)</p>
                    <p className="font-mono text-[10px] text-violet-300/70 break-all bg-white/5 p-2 rounded-lg">
                      [{shortHex(proofDisplay.proof[0] ?? "", 8)},<br />{shortHex(proofDisplay.proof[1] ?? "", 8)}]
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/60 border border-white/5 p-4 shadow-inner">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted mb-2">π_C (packed)</p>
                    <p className="font-mono text-[10px] text-violet-300/70 break-all bg-white/5 p-2 rounded-lg">
                      [{shortHex(proofDisplay.proof[6] ?? "", 8)},<br />{shortHex(proofDisplay.proof[7] ?? "", 8)}]
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-violet-500/10 to-transparent p-5 rounded-2xl border-l-2 border-violet-500">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mb-4">
                    Share this proof so anyone can verify you are in this room.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const payload = {
                        roomPda,
                        merkleTreeRoot: proofDisplay.merkleTreeRoot,
                        nullifierHash: proofDisplay.nullifierHash,
                        externalNullifier: proofDisplay.externalNullifier,
                        signal: "1",
                        proof: proofDisplay.proof,
                      };
                      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                    }}
                    className="inline-flex flex-row items-center gap-2 text-[10px] uppercase font-bold tracking-widest px-4 py-3 rounded-xl bg-black/40 border border-white/10 hover:bg-white/10 hover:text-white transition-all text-violet-300"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy Proof JSON
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status / Error Messages */}
      {status && (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center gap-3 animate-fadeIn">
          <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-violet-300">
            {status}
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 animate-fadeIn">
          <p className="text-[10px] uppercase font-bold tracking-widest text-red-400">
            {error}
          </p>
        </div>
      )}

      {/* Verify a proof */}
      <div className="rounded-3xl border border-white/5 bg-black/40 p-6 sm:p-8 backdrop-blur-xl shadow-inner group transition-all hover:border-white/10">
        <h4 className="text-sm font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
          Verify a Proof
        </h4>
        <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed mb-6 max-w-2xl">
          Paste a proof JSON (from &quot;Copy Proof JSON&quot;) to verify that someone is in this room&apos;s ZK group — without learning who they are.
        </p>

        <div className="space-y-4">
          <div className="relative group/textarea">
            <textarea
              value={verifyPaste}
              onChange={(e) => {
                setVerifyPaste(e.target.value);
                setVerifyResult("idle");
              }}
              placeholder='{"roomPda":"...","merkleTreeRoot":"...", ...}'
              className="w-full rounded-2xl border border-white/5 bg-black/60 px-4 py-4 text-white placeholder-white/20 focus:border-violet-500/50 focus:shadow-[0_0_20px_rgba(139,92,246,0.1)] focus:outline-none text-xs font-mono h-32 resize-none transition-all scrollbar-thin scrollbar-thumb-white/10"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <button
              type="button"
              onClick={handleVerifyProof}
              disabled={verifyLoading || !verifyPaste.trim()}
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:grayscale disabled:hover:bg-white/10 flex items-center justify-center min-w-[120px]"
            >
              {verifyLoading ? "Verifying…" : "Verify Proof"}
            </button>

            {verifyResult === "valid" && (
              <span className="text-[10px] px-4 py-3 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 font-bold uppercase tracking-widest flex items-center gap-2 animate-fadeIn">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Proof Valid
              </span>
            )}
            {verifyResult === "invalid" && (
              <span className="text-[10px] px-4 py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase tracking-widest flex items-center gap-2 animate-fadeIn">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Proof Invalid
              </span>
            )}
            {verifyResult === "error" && (
              <span className="text-[10px] px-4 py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase tracking-widest flex items-center gap-2 animate-fadeIn">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Error parsing JSON
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Details/How it works */}
      <details className="rounded-3xl border border-white/5 bg-black/40 p-6 backdrop-blur-xl group cursor-pointer transition-all hover:border-white/10">
        <summary className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted group-hover:text-white transition-colors outline-none flex items-center justify-between">
          How does this work?
          <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs group-open:rotate-180 transition-transform">↓</span>
        </summary>
        <div className="mt-6 space-y-5 pt-6 border-t border-white/5 text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted/80 leading-relaxed font-sans">
          <p>
            <span className="text-white">1. Identity Generation:</span> Your wallet signs a deterministic message. The signature is hashed with Poseidon to derive two private scalars (trapdoor + nullifier). These never leave your browser.
          </p>
          <p>
            <span className="text-white">2. Commitment:</span>{" "}
            <code className="text-violet-300 bg-violet-500/10 px-2 py-1 rounded-lg ml-1 font-mono lowercase tracking-normal border border-violet-500/20">commitment = poseidon(poseidon(trapdoor, nullifier))</code> <span className="block mt-2 opacity-70">— a public value stored in the group, unlinkable to your wallet address.</span>
          </p>
          <p>
            <span className="text-white">3. Merkle Tree:</span> All commitments form a depth-16 Poseidon Merkle tree (max 65,536 members).
          </p>
          <p>
            <span className="text-white">4. ZK Proof:</span> A Groth16 proof certifies you know a trapdoor+nullifier whose commitment is a leaf in the tree, <em className="text-violet-300 not-italic">without revealing which leaf</em>. Generated by snarkjs in your browser using PSE trusted setup circuits.
          </p>
          <p>
            <span className="text-white">5. Nullifier:</span> The nullifier hash is unique per identity+room — prevents the same identity from proving twice for the same scope.
          </p>
        </div>
      </details>

      {/* Reset */}
      {step !== "none" && (
        <div className="flex justify-center pt-4 pb-8">
          <button
            onClick={handleReset}
            className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted/50 hover:text-red-400 transition-colors"
          >
            Clear local identity
          </button>
        </div>
      )}
    </div>
  );
}
