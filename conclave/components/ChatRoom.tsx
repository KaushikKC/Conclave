"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useConclaveProgram } from "../hooks/useConclaveProgram";
import { getMessagePda, getMemberPda, getSessionPda } from "../lib/conclave";
import { decryptMessage, encryptMessage } from "../app/sdk/crypto";
import {
  fetchRoomMessages,
  postMessage,
  deleteMessageFromIndexer,
  fetchReputationBatch,
  ApiReputation,
} from "../lib/api";
import { getAnonAlias } from "../lib/anon";

const MAX_CIPHERTEXT_BYTES = 1024;
const POLL_INTERVAL_MS = 5000;
const EPHEMERAL_CHECK_MS = 10000;

const EPHEMERAL_DURATIONS = [
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
];

interface DecryptedMessage {
  publicKey: string;
  sender: string;
  text: string;
  timestamp: number;
  expiresAt?: number; // unix timestamp when this message self-destructs
}

interface ChatRoomProps {
  roomPda: PublicKey;
  groupKey: Uint8Array | null;
  /** Optional session keypair for gasless sending (no wallet popup). */
  sessionKeypair?: Keypair | null;
}

export default function ChatRoom({
  roomPda,
  groupKey,
  sessionKeypair,
}: ChatRoomProps) {
  const { program, wallet, connection } = useConclaveProgram();
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [repMap, setRepMap] = useState<Record<string, ApiReputation>>({});
  const repFetchedRef = useRef<Set<string>>(new Set());
  const [ephemeral, setEphemeral] = useState(false);
  const [ephemeralDuration, setEphemeralDuration] = useState(60); // default 1 min
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingSentRef = useRef<{
    sender: string;
    timestamp: number;
    text: string;
  } | null>(null);
  // Track ephemeral messages this user sent { messagePda: expiresAt }
  const ephemeralMapRef = useRef<Map<string, number>>(new Map());

  // Update "now" every second for countdown display
  useEffect(() => {
    const interval = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  const loadMessages = useCallback(async () => {
    if (!roomPda) return;
    try {
      const data = await fetchRoomMessages(roomPda.toBase58(), 200);
      const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);

      if (!groupKey) {
        setMessages(
          sorted.map((m) => ({
            publicKey: m.address,
            sender: m.sender,
            text: "[encrypted -- need group key]",
            timestamp: m.timestamp,
          })),
        );
        return;
      }

      const decrypted: DecryptedMessage[] = [];
      for (const m of sorted) {
        try {
          const ct = Uint8Array.from(atob(m.ciphertext), (c) =>
            c.charCodeAt(0),
          );
          const text = decryptMessage(groupKey, ct);
          const expiresAt = ephemeralMapRef.current.get(m.address);
          decrypted.push({
            publicKey: m.address,
            sender: m.sender,
            text,
            timestamp: m.timestamp,
            expiresAt,
          });
        } catch {
          decrypted.push({
            publicKey: m.address,
            sender: m.sender,
            text: "[decryption failed]",
            timestamp: m.timestamp,
          });
        }
      }

      // Keep optimistic message visible until it appears from the indexer
      const pending = pendingSentRef.current;
      if (pending) {
        const found = decrypted.some(
          (d) =>
            d.sender === pending.sender && d.timestamp === pending.timestamp,
        );
        if (found) pendingSentRef.current = null;
        else
          decrypted.push({
            publicKey: "",
            sender: pending.sender,
            text: pending.text,
            timestamp: pending.timestamp,
          });
        decrypted.sort((a, b) => a.timestamp - b.timestamp);
      }

      setMessages(decrypted);
    } catch (e: any) {
      setError(e?.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [roomPda, groupKey]);

  useEffect(() => {
    setLoading(true);
    loadMessages();
  }, [loadMessages]);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Fetch reputation for new unique senders (cached per session to avoid repeated calls)
  useEffect(() => {
    const newWallets = messages
      .map((m) => m.sender)
      .filter(
        (w, i, arr) => arr.indexOf(w) === i && !repFetchedRef.current.has(w),
      );
    if (newWallets.length === 0) return;
    newWallets.forEach((w) => repFetchedRef.current.add(w));
    fetchReputationBatch(newWallets).then((batch) => {
      setRepMap((prev) => ({ ...prev, ...batch }));
    });
  }, [messages]);

  // Auto-hide expired ephemeral messages (frontend-only, no on-chain tx)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = Math.floor(Date.now() / 1000);
      const expired: string[] = [];
      for (const [pda, expiresAt] of ephemeralMapRef.current.entries()) {
        if (currentTime >= expiresAt) {
          expired.push(pda);
        }
      }
      if (expired.length > 0) {
        for (const pda of expired) {
          ephemeralMapRef.current.delete(pda);
          deleteMessageFromIndexer(pda);
        }
        setMessages((prev) =>
          prev.filter((m) => !expired.includes(m.publicKey)),
        );
      }
    }, EPHEMERAL_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !wallet?.publicKey || !groupKey || !input.trim()) return;
    const plaintext = input.trim();
    const ciphertext = encryptMessage(groupKey, plaintext);
    if (ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      setError("Message too long (max 1024 bytes ciphertext).");
      return;
    }
    setSending(true);
    setError("");
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const senderKey = wallet.publicKey;
      const messagePda = getMessagePda(
        roomPda,
        senderKey,
        timestamp,
        program.programId,
      );
      const ciphertextBuf =
        typeof Buffer !== "undefined"
          ? Buffer.from(ciphertext)
          : new Uint8Array(ciphertext);

      if (sessionKeypair) {
        // ── Gasless path: session keypair signs, no wallet popup ─────────────
        const sessionPda = getSessionPda(roomPda, senderKey, program.programId);
        const memberPda = getMemberPda(roomPda, senderKey, program.programId);

        const tx = await program.methods
          .sendMessageWithSession(ciphertextBuf, new anchor.BN(timestamp))
          .accountsPartial({
            sessionKey: sessionKeypair.publicKey,
            room: roomPda,
            owner: senderKey,
            session: sessionPda,
            member: memberPda,
            message: messagePda,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        tx.feePayer = sessionKeypair.publicKey;
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;
        tx.sign(sessionKeypair);
        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );
      } else {
        // ── Normal path: wallet signs ────────────────────────────────────────
        await program.methods
          .sendMessage(ciphertextBuf, new anchor.BN(timestamp))
          .accountsPartial({
            sender: senderKey,
            room: roomPda,
            message: messagePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      setInput("");

      const expiresAt = ephemeral ? timestamp + ephemeralDuration : undefined;
      if (ephemeral && expiresAt) {
        ephemeralMapRef.current.set(messagePda.toBase58(), expiresAt);
      }

      pendingSentRef.current = {
        sender: senderKey.toBase58(),
        timestamp,
        text: plaintext,
      };
      setMessages((prev) => [
        ...prev,
        {
          publicKey: messagePda.toBase58(),
          sender: senderKey.toBase58(),
          text: plaintext,
          timestamp,
          expiresAt,
        },
      ]);
      const ciphertextBase64 = btoa(String.fromCharCode(...ciphertext));
      postMessage(
        roomPda.toBase58(),
        messagePda.toBase58(),
        senderKey.toBase58(),
        ciphertextBase64,
        timestamp,
      );
    } catch (err: any) {
      setError(err?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const anonName = (addr: string) => {
    const isMe = wallet?.publicKey && addr === wallet.publicKey.toBase58();
    const alias = getAnonAlias(addr, roomPda.toBase58());
    return isMe ? `${alias} (you)` : alias;
  };

  const tierBadge = (addr: string) => {
    const rep = repMap[addr];
    if (!rep || rep.tier === "none") return null;
    const styles: Record<string, string> = {
      bronze: "text-amber-500",
      silver: "text-gray-300",
      gold: "text-yellow-400",
    };
    return (
      <span
        className={`text-[9px] font-bold ${styles[rep.tier]}`}
        title={`${rep.tier} — ${rep.total} actions`}
      >
        ◆
      </span>
    );
  };

  const formatCountdown = (expiresAt: number) => {
    const remaining = expiresAt - now;
    if (remaining <= 0) return "expiring...";
    if (remaining < 60) return `${remaining}s`;
    return `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
  };

  return (
    <div className="flex flex-col h-[600px] relative z-10 w-full animate-fadeIn">
      {/* Background blobs for chat */}
      <div className="absolute top-10 left-10 w-64 h-64 bg-conclave-pink/5 rounded-full mix-blend-screen filter blur-[80px] z-0 pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-64 h-64 bg-conclave-blue/5 rounded-full mix-blend-screen filter blur-[80px] z-0 pointer-events-none"></div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-6 p-6 rounded-3xl bg-black/40 border border-white/5 backdrop-blur-xl shadow-inner scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative z-10">
        {loading && (
          <div className="flex justify-center items-center h-full">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-conclave-textMuted animate-bounce"></div>
              <div className="w-2 h-2 rounded-full bg-conclave-textMuted animate-bounce" style={{ animationDelay: "0.2s" }}></div>
              <div className="w-2 h-2 rounded-full bg-conclave-textMuted animate-bounce" style={{ animationDelay: "0.4s" }}></div>
            </div>
          </div>
        )}

        {messages.map((m, idx) => {
          const isMe = wallet?.publicKey && m.sender === wallet.publicKey.toBase58();
          return (
            <div key={m.publicKey || `${m.timestamp}-${idx}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} w-full animate-fadeIn`}>
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className={`text-[10px] uppercase font-bold tracking-widest ${isMe ? 'text-conclave-pink' : 'text-conclave-blue'}`}>
                  {anonName(m.sender)}
                </span>
                {tierBadge(m.sender)}
                <span className="text-[10px] text-conclave-textMuted opacity-50">
                  {new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {m.expiresAt && (
                  <span className="text-[10px] uppercase font-bold tracking-widest text-conclave-yellow bg-conclave-yellow/10 px-2 py-0.5 rounded flex items-center gap-1 border border-conclave-yellow/20" title="Ephemeral message">
                    <span className="w-1.5 h-1.5 rounded-full bg-conclave-yellow animate-pulse"></span>
                    {formatCountdown(m.expiresAt)}
                  </span>
                )}
              </div>

              <div className={`px-5 py-3.5 max-w-[85%] rounded-2xl text-sm leading-relaxed ${m.expiresAt
                  ? 'bg-conclave-yellow/10 border border-conclave-yellow/20 text-conclave-yellow shadow-[0_5px_15px_rgba(255,200,0,0.05)]'
                  : isMe
                    ? 'bg-gradient-to-br from-conclave-pink/20 to-conclave-pink/5 border border-conclave-pink/20 text-white shadow-[0_5px_15px_rgba(255,77,141,0.1)] rounded-tr-sm'
                    : 'bg-black/60 border border-white/5 text-gray-200 shadow-[0_5px_15px_rgba(0,0,0,0.2)] rounded-tl-sm'
                }`}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="relative z-10 px-2 flex flex-col gap-2">
        {error && (
          <p className="text-[10px] uppercase font-bold tracking-widest text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl inline-block self-start">
            {error}
          </p>
        )}

        {sessionKeypair && (
          <div className="flex items-center gap-2 px-2 self-start">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.8)]"></div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-green-400/80">
              Gas-Free Session Active
            </p>
          </div>
        )}

        <form onSubmit={sendMessage} className="flex gap-3 items-center bg-black/40 p-2 pl-4 rounded-2xl border border-white/5 backdrop-blur-xl focus-within:border-conclave-pink/30 focus-within:shadow-[0_0_20px_rgba(255,77,141,0.1)] transition-all">
          <div className="flex items-center gap-2 border-r border-white/10 pr-3">
            <button
              type="button"
              onClick={() => setEphemeral(!ephemeral)}
              className={`p-2 rounded-xl transition-all ${ephemeral
                  ? "bg-conclave-yellow/20 text-conclave-yellow shadow-[0_0_15px_rgba(255,200,0,0.2)]"
                  : "text-conclave-textMuted hover:bg-white/5 hover:text-white"
                }`}
              title={ephemeral ? "Ephemeral Mode ON" : "Enable Ephemeral Mode"}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {ephemeral && (
              <select
                value={ephemeralDuration}
                onChange={(e) => setEphemeralDuration(Number(e.target.value))}
                className="text-[10px] uppercase font-bold tracking-widest rounded-lg border border-conclave-yellow/30 bg-black text-conclave-yellow px-2 py-1.5 focus:outline-none appearance-none cursor-pointer"
              >
                {EPHEMERAL_DURATIONS.map((d) => (
                  <option key={d.seconds} value={d.seconds}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ephemeral ? "Type an ephemeral message..." : "Message workspace..."}
            className={`flex-1 bg-transparent px-3 py-3 text-white placeholder-conclave-textMuted focus:outline-none text-sm ${ephemeral ? "placeholder-conclave-yellow/50" : ""
              }`}
            disabled={!groupKey || sending}
          />

          <button
            type="submit"
            disabled={!groupKey || sending || !input.trim()}
            className="p-3 rounded-xl bg-conclave-pink hover:bg-conclave-pink/80 text-white transition-all disabled:opacity-50 disabled:grayscale disabled:hover:bg-conclave-pink flex items-center justify-center min-w-[3rem]"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
