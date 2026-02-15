"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useConclaveProgram } from "../hooks/useConclaveProgram";
import { getMessagePda } from "../lib/conclave";
import { decryptMessage, encryptMessage } from "../app/sdk/crypto";
import { fetchRoomMessages } from "../lib/api";

const MAX_CIPHERTEXT_BYTES = 1024;
const POLL_INTERVAL_MS = 5000;

interface DecryptedMessage {
  publicKey: string;
  sender: string;
  text: string;
  timestamp: number;
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
            text: "[encrypted — need group key]",
            timestamp: m.timestamp,
          })),
        );
        return;
      }

      const decrypted: DecryptedMessage[] = [];
      for (const m of sorted) {
        try {
          // Indexer stores ciphertext as base64
          const ct = Uint8Array.from(atob(m.ciphertext), (c) =>
            c.charCodeAt(0),
          );
          const text = decryptMessage(groupKey, ct);
          decrypted.push({
            publicKey: m.address,
            sender: m.sender,
            text,
            timestamp: m.timestamp,
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
      await program.methods
        .sendMessage(Array.from(ciphertext), new anchor.BN(timestamp))
        .accountsPartial({
          sender: wallet.publicKey,
          room: roomPda,
          message: messagePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setInput("");
      setMessages((prev) => [
        ...prev,
        {
          publicKey: "",
          sender: wallet.publicKey!.toBase58(),
          text: plaintext,
          timestamp,
        },
      ]);
    } catch (err: any) {
      setError(err?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const shortAddress = (addr: string) =>
    `${addr.slice(0, 4)}…${addr.slice(-4)}`;

  return (
    <div className="flex flex-col h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 p-2 rounded-lg bg-conclave-dark/50">
        {loading && <p className="text-conclave-muted text-sm">Loading…</p>}
        {messages.map((m) => (
          <div key={m.publicKey || m.timestamp} className="text-sm">
            <span className="text-conclave-accent font-mono">
              {shortAddress(m.sender)}
            </span>
            <span className="text-conclave-muted mx-2">·</span>
            <span className="text-gray-300">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-conclave-border bg-conclave-dark px-3 py-2 text-white placeholder-conclave-muted focus:border-conclave-accent focus:outline-none text-sm"
          disabled={!groupKey || sending}
        />
        <button
          type="submit"
          disabled={!groupKey || sending}
          className="btn-primary text-sm"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
