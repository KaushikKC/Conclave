"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useConclaveProgram } from "../hooks/useConclaveProgram";
import { getMessagePda } from "../lib/conclave";
import { decryptMessage, encryptMessage } from "../app/sdk/crypto";
import { fetchRoomMessages, postMessage, deleteMessageFromIndexer } from "../lib/api";
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
}

export default function ChatRoom({ roomPda, groupKey }: ChatRoomProps) {
  const { program, wallet } = useConclaveProgram();
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
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
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
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
        setMessages((prev) => prev.filter((m) => !expired.includes(m.publicKey)));
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
      const messagePda = getMessagePda(
        roomPda,
        wallet.publicKey,
        timestamp,
        program.programId,
      );
      const ciphertextBuf =
        typeof Buffer !== "undefined"
          ? Buffer.from(ciphertext)
          : new Uint8Array(ciphertext);
      await program.methods
        .sendMessage(ciphertextBuf, new anchor.BN(timestamp))
        .accountsPartial({
          sender: wallet.publicKey,
          room: roomPda,
          message: messagePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setInput("");

      const expiresAt = ephemeral ? timestamp + ephemeralDuration : undefined;
      if (ephemeral && expiresAt) {
        ephemeralMapRef.current.set(messagePda.toBase58(), expiresAt);
      }

      pendingSentRef.current = {
        sender: wallet.publicKey!.toBase58(),
        timestamp,
        text: plaintext,
      };
      setMessages((prev) => [
        ...prev,
        {
          publicKey: messagePda.toBase58(),
          sender: wallet.publicKey!.toBase58(),
          text: plaintext,
          timestamp,
          expiresAt,
        },
      ]);
      // Relay encrypted message directly to indexer
      const ciphertextBase64 = btoa(String.fromCharCode(...ciphertext));
      postMessage(
        roomPda.toBase58(),
        messagePda.toBase58(),
        wallet.publicKey!.toBase58(),
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

  const formatCountdown = (expiresAt: number) => {
    const remaining = expiresAt - now;
    if (remaining <= 0) return "expiring...";
    if (remaining < 60) return `${remaining}s`;
    return `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
  };

  return (
    <div className="flex flex-col h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 p-2 rounded-lg bg-conclave-dark/50">
        {loading && <p className="text-conclave-muted text-sm">Loading...</p>}
        {messages.map((m) => (
          <div key={m.publicKey || m.timestamp} className="text-sm">
            <span className="text-conclave-accent font-medium">
              {anonName(m.sender)}
            </span>
            <span className="text-conclave-muted mx-2">&middot;</span>
            <span className="text-gray-300">{m.text}</span>
            {m.expiresAt && (
              <span className="ml-2 text-xs text-yellow-400/70" title="Ephemeral message">
                {formatCountdown(m.expiresAt)}
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      <form onSubmit={sendMessage} className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => setEphemeral(!ephemeral)}
          className={`text-xs px-2 py-1 rounded-md border transition ${
            ephemeral
              ? "border-yellow-400/50 bg-yellow-400/10 text-yellow-400"
              : "border-conclave-border text-conclave-muted hover:text-white"
          }`}
          title={ephemeral ? "Ephemeral mode ON — messages self-destruct" : "Enable ephemeral mode"}
        >
          {ephemeral ? `${EPHEMERAL_DURATIONS.find((d) => d.seconds === ephemeralDuration)?.label || ""}` : ""}
        </button>
        {ephemeral && (
          <select
            value={ephemeralDuration}
            onChange={(e) => setEphemeralDuration(Number(e.target.value))}
            className="text-xs rounded-md border border-conclave-border bg-conclave-dark text-yellow-400 px-1 py-1"
          >
            {EPHEMERAL_DURATIONS.map((d) => (
              <option key={d.seconds} value={d.seconds}>
                {d.label}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ephemeral ? "Ephemeral message..." : "Type a message..."}
          className={`flex-1 rounded-lg border px-3 py-2 text-white placeholder-conclave-muted focus:outline-none text-sm ${
            ephemeral
              ? "border-yellow-400/30 bg-conclave-dark focus:border-yellow-400"
              : "border-conclave-border bg-conclave-dark focus:border-conclave-accent"
          }`}
          disabled={!groupKey || sending}
        />
        <button
          type="submit"
          disabled={!groupKey || sending}
          className="btn-primary text-sm"
        >
          {sending ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
