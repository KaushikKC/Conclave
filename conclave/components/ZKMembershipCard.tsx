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
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-conclave-border bg-conclave-dark/50 p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30 font-medium">
            ZK — Groth16
          </span>
          <h3 className="font-semibold text-white">Anonymous Membership Proof</h3>
        </div>
        <p className="text-conclave-muted text-sm leading-relaxed">
          Prove you hold governance tokens <span className="text-white font-medium">without revealing your wallet</span>.
          Uses a Semaphore Poseidon Merkle circuit — a real Groth16 zero-knowledge proof generated entirely in your browser.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg border border-conclave-border/50 bg-conclave-dark p-2">
            <p className="text-white font-medium">{groupSize}</p>
            <p className="text-conclave-muted">ZK Members</p>
          </div>
          <div className="rounded-lg border border-conclave-border/50 bg-conclave-dark p-2">
            <p className="text-white font-medium">Groth16</p>
            <p className="text-conclave-muted">Proof System</p>
          </div>
          <div className="rounded-lg border border-conclave-border/50 bg-conclave-dark p-2">
            <p className="text-white font-medium">Poseidon</p>
            <p className="text-conclave-muted">Hash (ZK-friendly)</p>
          </div>
        </div>
      </div>

      {/* Step 1 — Register Identity */}
      <div
        className={`rounded-xl border p-4 transition ${
          step === "none"
            ? "border-violet-500/40 bg-violet-500/5"
            : "border-conclave-border/50 bg-conclave-dark/30"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              step !== "none"
                ? "bg-green-500 text-white"
                : "bg-violet-500/30 text-violet-400"
            }`}
          >
            {step !== "none" ? "✓" : "1"}
          </span>
          <span className="text-sm font-medium text-white">
            Generate ZK Identity
          </span>
        </div>
        <p className="text-xs text-conclave-muted mb-3 pl-7">
          Sign a message to derive your anonymous Semaphore identity. Your wallet signature is hashed — the on-chain commitment reveals nothing about which wallet you used.
        </p>

        {step === "none" ? (
          <div className="pl-7">
            <button
              onClick={handleRegister}
              disabled={loading || !isMember}
              className="btn-primary text-sm disabled:opacity-50"
              title={!isMember ? "You must be a room member first" : ""}
            >
              {loading && status.includes("identity")
                ? "Generating..."
                : "Generate & Register Identity"}
            </button>
            {!isMember && (
              <p className="text-xs text-yellow-400 mt-2">
                Join the room first to register a ZK identity.
              </p>
            )}
          </div>
        ) : (
          <div className="pl-7 space-y-1">
            <p className="text-xs text-green-400">Identity registered</p>
            <div className="rounded-lg bg-conclave-dark border border-conclave-border/50 p-2">
              <p className="text-[10px] text-conclave-muted mb-0.5">Your commitment (public, unlinkable to wallet)</p>
              <p className="text-[10px] font-mono text-violet-300 break-all">
                {shortHex(commitment, 20)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Step 2 — Generate ZK Proof */}
      <div
        className={`rounded-xl border p-4 transition ${
          step === "registered"
            ? "border-violet-500/40 bg-violet-500/5"
            : step === "proved"
            ? "border-green-500/30 bg-green-500/5"
            : "border-conclave-border/50 bg-conclave-dark/30 opacity-50"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              step === "proved"
                ? "bg-green-500 text-white"
                : step === "registered"
                ? "bg-violet-500/30 text-violet-400"
                : "bg-conclave-border text-conclave-muted"
            }`}
          >
            {step === "proved" ? "✓" : "2"}
          </span>
          <span className="text-sm font-medium text-white">
            Prove Membership
          </span>
        </div>
        <p className="text-xs text-conclave-muted mb-3 pl-7">
          Generate a Groth16 proof that your commitment is a leaf in the group&apos;s Poseidon Merkle tree — without revealing <em>which</em> leaf.
        </p>

        {step === "registered" && (
          <div className="pl-7">
            <button
              onClick={handleProve}
              disabled={loading}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate ZK Proof"}
            </button>
            <p className="text-[10px] text-conclave-muted mt-2">
              First run downloads circuit artifacts (~28 MB) from PSE. Cached on reload.
            </p>
          </div>
        )}

        {step === "proved" && proofDisplay && (
          <div className="pl-7 space-y-2">
            <div className="flex items-center gap-2">
              {proofDisplay.verified ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-medium">
                  Proof Valid ✓
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-medium">
                  Proof Generated (vkey fetch needed for on-chain verify)
                </span>
              )}
            </div>

            <div className="rounded-lg bg-conclave-dark border border-conclave-border/50 p-3 space-y-2 text-[10px]">
              <div>
                <p className="text-conclave-muted mb-0.5">Merkle Root (group state)</p>
                <p className="font-mono text-violet-300 break-all">
                  {shortHex(proofDisplay.merkleTreeRoot, 18)}
                </p>
              </div>
              <div>
                <p className="text-conclave-muted mb-0.5">Nullifier Hash (prevents double-use)</p>
                <p className="font-mono text-violet-300 break-all">
                  {shortHex(proofDisplay.nullifierHash, 18)}
                </p>
              </div>
              <div>
                <p className="text-conclave-muted mb-0.5">π_A — G1 point (packed)</p>
                <p className="font-mono text-violet-300/70 break-all">
                  [{shortHex(proofDisplay.proof[0] ?? "", 10)}, {shortHex(proofDisplay.proof[1] ?? "", 10)}]
                </p>
              </div>
              <div>
                <p className="text-conclave-muted mb-0.5">π_C — G1 point (packed)</p>
                <p className="font-mono text-violet-300/70 break-all">
                  [{shortHex(proofDisplay.proof[6] ?? "", 10)}, {shortHex(proofDisplay.proof[7] ?? "", 10)}]
                </p>
              </div>
            </div>

            <p className="text-[10px] text-conclave-muted">
              Share the proof JSON below so anyone can verify you are in this room’s ZK group (without revealing who you are).
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
              className="text-xs text-violet-400 hover:underline"
            >
              Copy proof for verification
            </button>

            <button
              onClick={handleProve}
              disabled={loading}
              className="text-xs text-violet-400 hover:underline disabled:opacity-50 ml-3"
            >
              Regenerate proof
            </button>
          </div>
        )}
      </div>

      {/* Status / Error */}
      {status && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          <p className="text-xs text-violet-300">
            <span className="animate-pulse mr-1">◆</span>
            {status}
          </p>
        </div>
      )}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* Verify a proof (anyone can do this) */}
      <div className="rounded-xl border border-conclave-border/50 bg-conclave-dark/30 p-4">
        <h4 className="text-sm font-medium text-white mb-2">Verify a proof</h4>
        <p className="text-xs text-conclave-muted mb-2">
          Paste a proof JSON (from &quot;Copy proof for verification&quot;) to verify that someone is in this room&apos;s ZK group — without learning who they are.
        </p>
        <textarea
          value={verifyPaste}
          onChange={(e) => {
            setVerifyPaste(e.target.value);
            setVerifyResult("idle");
          }}
          placeholder='{"roomPda":"...","merkleTreeRoot":"...","nullifierHash":"...","externalNullifier":"...","signal":"1","proof":[...]}'
          className="w-full rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none text-xs font-mono h-24"
          spellCheck={false}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={handleVerifyProof}
            disabled={verifyLoading || !verifyPaste.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {verifyLoading ? "Verifying…" : "Verify proof"}
          </button>
          {verifyResult === "valid" && (
            <span className="text-xs text-green-400 font-medium">✓ Proof valid — prover is in this room&apos;s ZK group.</span>
          )}
          {verifyResult === "invalid" && (
            <span className="text-xs text-red-400 font-medium">Proof invalid.</span>
          )}
          {verifyResult === "error" && (
            <span className="text-xs text-red-400 font-medium">Invalid JSON or verification failed.</span>
          )}
        </div>
      </div>

      {/* How it works */}
      <details className="rounded-xl border border-conclave-border/30 p-4">
        <summary className="text-xs text-conclave-muted cursor-pointer hover:text-white">
          How does this work? ›
        </summary>
        <div className="mt-3 space-y-2 text-xs text-conclave-muted leading-relaxed">
          <p>
            <span className="text-white">1. Identity Generation:</span> Your wallet signs a deterministic message. The signature is hashed with Poseidon to derive two private scalars (trapdoor + nullifier). These never leave your browser.
          </p>
          <p>
            <span className="text-white">2. Commitment:</span>{" "}
            <code className="text-violet-300">commitment = poseidon(poseidon(trapdoor, nullifier))</code> — a public value stored in the group, unlinkable to your wallet address.
          </p>
          <p>
            <span className="text-white">3. Merkle Tree:</span> All commitments form a depth-16 Poseidon Merkle tree (max 65,536 members).
          </p>
          <p>
            <span className="text-white">4. ZK Proof:</span> A Groth16 proof certifies you know a trapdoor+nullifier whose commitment is a leaf in the tree, <em>without revealing which leaf</em>. Generated by snarkjs in your browser using PSE trusted setup circuits.
          </p>
          <p>
            <span className="text-white">5. Nullifier:</span> The nullifier hash is unique per identity+room — prevents the same identity from proving twice for the same scope.
          </p>
        </div>
      </details>

      {/* Reset */}
      {step !== "none" && (
        <button
          onClick={handleReset}
          className="text-[10px] text-conclave-muted hover:text-red-400 transition"
        >
          Clear local identity
        </button>
      )}
    </div>
  );
}
