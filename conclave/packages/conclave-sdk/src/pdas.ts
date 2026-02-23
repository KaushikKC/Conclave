import { PublicKey } from "@solana/web3.js";

/** Conclave program ID (devnet) */
export const CONCLAVE_PROGRAM_ID = new PublicKey(
  "E5HrS48LBddCwXGdq4ULPB8bC8rihUReDmu9eRiPQieU"
);

/** Room PDA: ["room", authority, name] */
export function getRoomPda(
  authority: PublicKey,
  name: string,
  programId: PublicKey = CONCLAVE_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("room"), authority.toBuffer(), Buffer.from(name)],
    programId
  );
  return pda;
}

/** Member PDA: ["member", room, wallet] */
export function getMemberPda(
  room: PublicKey,
  wallet: PublicKey,
  programId: PublicKey = CONCLAVE_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), room.toBuffer(), wallet.toBuffer()],
    programId
  );
  return pda;
}

/** Proposal PDA: ["proposal", room, title] */
export function getProposalPda(
  room: PublicKey,
  title: string,
  programId: PublicKey = CONCLAVE_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), room.toBuffer(), Buffer.from(title)],
    programId
  );
  return pda;
}

/** Vote commitment PDA: ["vote", proposal, voter] */
export function getVoteCommitmentPda(
  proposal: PublicKey,
  voter: PublicKey,
  programId: PublicKey = CONCLAVE_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), proposal.toBuffer(), voter.toBuffer()],
    programId
  );
  return pda;
}

/** Message PDA: ["message", room, sender, timestamp_le_bytes] */
export function getMessagePda(
  room: PublicKey,
  sender: PublicKey,
  timestamp: number,
  programId: PublicKey = CONCLAVE_PROGRAM_ID
): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(timestamp), 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("message"),
      room.toBuffer(),
      sender.toBuffer(),
      buf,
    ],
    programId
  );
  return pda;
}

/** Session PDA: ["session", room, owner] */
export function getSessionPda(
  room: PublicKey,
  owner: PublicKey,
  programId: PublicKey = CONCLAVE_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("session"), room.toBuffer(), owner.toBuffer()],
    programId
  );
  return pda;
}

/** Treasury PDA: ["treasury", room] */
export function getTreasuryPda(
  room: PublicKey,
  programId: PublicKey = CONCLAVE_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), room.toBuffer()],
    programId
  );
  return pda;
}
