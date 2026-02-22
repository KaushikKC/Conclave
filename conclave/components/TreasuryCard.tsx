"use client";

import { useState, useEffect } from "react";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { useConclaveProgram } from "../hooks/useConclaveProgram";
import { getTreasuryPda } from "../lib/conclave";

interface TreasuryCardProps {
  roomPda: string;
  roomAuthority: string;
}

export default function TreasuryCard({ roomPda, roomAuthority }: TreasuryCardProps) {
  const { program, wallet } = useConclaveProgram();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [treasuryExists, setTreasuryExists] = useState<boolean | null>(null);
  const [fundAmount, setFundAmount] = useState("0.01");
  const [fundLoading, setFundLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isAuthority = wallet?.publicKey?.toBase58() === roomAuthority;

  const loadBalance = async () => {
    if (!program) return;
    try {
      const roomPubkey = new PublicKey(roomPda);
      const treasuryPda = getTreasuryPda(roomPubkey, program.programId);
      const info = await connection.getAccountInfo(treasuryPda);
      if (!info) {
        setTreasuryExists(false);
        setBalance(null);
        return;
      }
      setTreasuryExists(true);
      setBalance(info.lamports / LAMPORTS_PER_SOL);
    } catch {
      setTreasuryExists(false);
    }
  };

  useEffect(() => { loadBalance(); }, [program, roomPda, connection]);

  const handleInit = async () => {
    if (!program || !wallet?.publicKey) return;
    setInitLoading(true);
    setError("");
    try {
      const roomPubkey = new PublicKey(roomPda);
      const treasuryPda = getTreasuryPda(roomPubkey, program.programId);
      await program.methods
        .initTreasury()
        .accountsPartial({
          authority: wallet.publicKey,
          room: roomPubkey,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setSuccess("Treasury initialized!");
      await loadBalance();
    } catch (err: any) {
      setError(err?.message || "Init failed");
    } finally {
      setInitLoading(false);
    }
  };

  const handleFund = async () => {
    if (!program || !wallet?.publicKey) return;
    const lamports = Math.round(parseFloat(fundAmount) * LAMPORTS_PER_SOL);
    if (!lamports || lamports <= 0) { setError("Invalid amount"); return; }

    setFundLoading(true);
    setError("");
    try {
      const roomPubkey = new PublicKey(roomPda);
      const treasuryPda = getTreasuryPda(roomPubkey, program.programId);
      await program.methods
        .fundTreasury(new (require("@coral-xyz/anchor").BN)(lamports))
        .accountsPartial({
          funder: wallet.publicKey,
          room: roomPubkey,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setSuccess(`Funded ${fundAmount} SOL!`);
      setTimeout(() => setSuccess(""), 3000);
      setFundAmount("0.01");
      await loadBalance();
    } catch (err: any) {
      setError(err?.message || "Fund failed");
    } finally {
      setFundLoading(false);
    }
  };

  if (treasuryExists === null) {
    return <p className="text-conclave-muted text-sm">Loading treasury…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Room Treasury</h3>
          {treasuryExists ? (
            <p className="text-2xl font-bold text-conclave-accent mt-1">
              {balance !== null ? `${balance.toFixed(4)} SOL` : "—"}
            </p>
          ) : (
            <p className="text-conclave-muted text-sm mt-1">Not initialized yet</p>
          )}
        </div>
        <button onClick={loadBalance} className="text-conclave-accent text-xs hover:underline">
          Refresh
        </button>
      </div>

      {!treasuryExists && isAuthority && (
        <div>
          <p className="text-conclave-muted text-sm mb-2">
            Initialize the treasury to enable SOL-backed proposal execution.
          </p>
          <button
            onClick={handleInit}
            disabled={initLoading}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {initLoading ? "Initializing…" : "Initialize Treasury"}
          </button>
        </div>
      )}

      {treasuryExists && (
        <div>
          <label className="block text-xs text-conclave-muted mb-1">Fund treasury (SOL)</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="w-32 bg-conclave-dark border border-conclave-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-conclave-accent"
            />
            <button
              onClick={handleFund}
              disabled={fundLoading}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {fundLoading ? "Funding…" : "Fund"}
            </button>
          </div>
        </div>
      )}

      {!treasuryExists && !isAuthority && (
        <p className="text-conclave-muted text-sm italic">
          The room authority needs to initialize the treasury first.
        </p>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-green-400 text-sm">{success}</p>}

      {treasuryExists && (
        <p className="text-[10px] text-conclave-muted border-t border-conclave-border/30 pt-2">
          Winning proposals can trigger SOL transfers from this treasury — governance with teeth.
        </p>
      )}
    </div>
  );
}
