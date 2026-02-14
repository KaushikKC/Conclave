"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import idlRaw from "../lib/idl/conclave.json";

/**
 * Strip events from the IDL so Anchor's BorshEventCoder doesn't require event
 * type definitions. Our lib IDL only has account types (DaoRoom, Member, etc.),
 * not event types (MemberJoined, RoomCreated, etc.), which causes "Event not found".
 * We don't use event parsing in the frontend, so an empty event coder is fine.
 */
function idlWithoutEvents(idl: any): any {
  const { events: _events, ...rest } = idl;
  return rest;
}

const idl = idlWithoutEvents(idlRaw);
const PROGRAM_ID = new PublicKey(idl.address);

const dummyWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async (tx: any) => tx,
  signAllTransactions: async (txs: any[]) => txs,
};

export function useConclaveProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    if (!wallet.publicKey) return null;
    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    return new Program(idl as any, provider);
  }, [connection, wallet.publicKey, wallet]);

  const programReadOnly = useMemo(() => {
    const provider = new AnchorProvider(connection, dummyWallet as any, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    return new Program(idl as any, provider);
  }, [connection]);

  return {
    program,
    programReadOnly,
    programId: PROGRAM_ID,
    wallet,
    connection,
  };
}
