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
    return (
      <div className="flex justify-center py-6 animate-fadeIn">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce"></div>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "0.2s" }}></div>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "0.4s" }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Treasury Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div>
          <h3 className="text-xs font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)] animate-pulse"></span>
            Workspace Treasury
          </h3>
          {treasuryExists ? (
            <p className="text-3xl font-black text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.3)]">
              {balance !== null ? `${balance.toFixed(4)} ` : "— "}
              <span className="text-sm text-green-400/60">SOL</span>
            </p>
          ) : (
            <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted bg-black/40 px-3 py-1.5 rounded-xl border border-white/5 inline-block">
              Not Initialized
            </p>
          )}
        </div>
        <button
          onClick={loadBalance}
          className="text-[10px] uppercase font-bold tracking-widest text-green-400 hover:text-white transition-colors self-start sm:self-auto bg-green-500/10 px-4 py-2 rounded-xl border border-green-500/20 hover:bg-green-500/20"
        >
          Refresh
        </button>
      </div>

      {/* Initialization (Authority only) */}
      {!treasuryExists && isAuthority && (
        <div className="bg-gradient-to-br from-green-500/10 to-black/40 p-6 rounded-2xl border border-green-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-400/10 rounded-full mix-blend-screen filter blur-[40px] z-0 pointer-events-none group-hover:bg-green-400/20 transition-all duration-500"></div>
          <div className="relative z-10">
            <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted leading-relaxed mb-6">
              Initialize the treasury to enable SOL-backed automatic proposal execution. This allows the DAO to hold and distribute funds.
            </p>
            <button
              onClick={handleInit}
              disabled={initLoading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-400 hover:from-green-500 hover:to-green-300 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:grayscale shadow-[0_0_20px_rgba(74,222,128,0.2)]"
            >
              {initLoading ? "Initializing On-Chain…" : "Initialize Treasury"}
            </button>
          </div>
        </div>
      )}

      {/* Funding Form */}
      {treasuryExists && (
        <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
          <label className="block text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted mb-3">
            Fund Treasury <span className="text-green-400">(SOL)</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-conclave-textMuted font-mono">◎</span>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-green-400/50 focus:shadow-[0_0_15px_rgba(74,222,128,0.1)] transition-all font-mono"
              />
            </div>
            <button
              onClick={handleFund}
              disabled={fundLoading}
              className="px-8 py-3 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 hover:border-green-500/40 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
            >
              {fundLoading ? "Processing…" : "Fund"}
            </button>
          </div>
        </div>
      )}

      {/* Not Initialized Note */}
      {!treasuryExists && !isAuthority && (
        <div className="text-center p-6 bg-black/40 rounded-2xl border border-white/5">
          <p className="text-[10px] uppercase font-bold tracking-widest text-conclave-textMuted italic">
            The workspace authority must initialize the treasury first.
          </p>
        </div>
      )}

      {/* Status Messages */}
      {(error || success) && (
        <div className={`p-4 rounded-xl text-[10px] uppercase font-bold tracking-widest ${error ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-green-500/10 text-green-400 border border-green-500/20"
          }`}>
          {error || success}
        </div>
      )}

      {/* Footer Note */}
      {treasuryExists && (
        <p className="text-[9px] uppercase font-bold tracking-widest text-conclave-textMuted/60 text-center px-4">
          Winning proposals can automatically trigger solvent transfers from this treasury — governance with teeth.
        </p>
      )}
    </div>
  );
}
