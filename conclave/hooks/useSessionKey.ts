import { useState, useEffect, useCallback } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";

const KEYPAIR_PREFIX = "conclave_sk_";
const SESSION_HOURS = 24;

export interface SessionKeyInfo {
  keypair: Keypair | null;
  sessionPda: PublicKey | null;
  expiresAt: number | null;
  isActive: boolean;
}

function loadStoredKeypair(roomPda: string): { keypair: Keypair; expiresAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEYPAIR_PREFIX + roomPda);
    if (!raw) return null;
    const { secretKey, expiresAt } = JSON.parse(raw);
    if (expiresAt < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem(KEYPAIR_PREFIX + roomPda);
      return null;
    }
    return { keypair: Keypair.fromSecretKey(new Uint8Array(secretKey)), expiresAt };
  } catch {
    return null;
  }
}

export function getSessionPda(
  room: PublicKey,
  owner: PublicKey,
  programId: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("session"), room.toBuffer(), owner.toBuffer()],
    programId,
  );
  return pda;
}

/** Generate a fresh session keypair and persist it to localStorage. */
export function generateAndStoreSessionKeypair(roomPda: string): { keypair: Keypair; expiresAt: number } {
  const keypair = Keypair.generate();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  localStorage.setItem(
    KEYPAIR_PREFIX + roomPda,
    JSON.stringify({ secretKey: Array.from(keypair.secretKey), expiresAt }),
  );
  return { keypair, expiresAt };
}

export function clearSessionKeypair(roomPda: string) {
  if (typeof window !== "undefined") localStorage.removeItem(KEYPAIR_PREFIX + roomPda);
}

/** Hook: loads session keypair from localStorage for the given room. */
export function useSessionKey(roomPda: string | null): SessionKeyInfo {
  const [info, setInfo] = useState<SessionKeyInfo>({
    keypair: null,
    sessionPda: null,
    expiresAt: null,
    isActive: false,
  });

  useEffect(() => {
    if (!roomPda) return;
    const stored = loadStoredKeypair(roomPda);
    if (stored) {
      setInfo({
        keypair: stored.keypair,
        sessionPda: null, // caller computes this with programId + owner
        expiresAt: stored.expiresAt,
        isActive: true,
      });
    } else {
      setInfo({ keypair: null, sessionPda: null, expiresAt: null, isActive: false });
    }
  }, [roomPda]);

  return info;
}

/** Refresh session state (call after creating a new session). */
export function refreshSessionKey(roomPda: string): SessionKeyInfo {
  const stored = loadStoredKeypair(roomPda);
  if (stored) {
    return {
      keypair: stored.keypair,
      sessionPda: null,
      expiresAt: stored.expiresAt,
      isActive: true,
    };
  }
  return { keypair: null, sessionPda: null, expiresAt: null, isActive: false };
}
