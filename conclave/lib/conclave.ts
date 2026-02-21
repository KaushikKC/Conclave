import { PublicKey } from "@solana/web3.js";

export const CONCLAVE_PROGRAM_ID = new PublicKey(
  "E5HrS48LBddCwXGdq4ULPB8bC8rihUReDmu9eRiPQieU",
);

export function getRoomPda(
  authority: PublicKey,
  name: string,
  programId: PublicKey = CONCLAVE_PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("room"), authority.toBuffer(), Buffer.from(name)],
    programId,
  );
  return pda;
}

export function getMemberPda(
  room: PublicKey,
  wallet: PublicKey,
  programId: PublicKey = CONCLAVE_PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), room.toBuffer(), wallet.toBuffer()],
    programId,
  );
  return pda;
}

export function getProposalPda(
  room: PublicKey,
  title: string,
  programId: PublicKey = CONCLAVE_PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), room.toBuffer(), Buffer.from(title)],
    programId,
  );
  return pda;
}

export function getVoteCommitmentPda(
  proposal: PublicKey,
  voter: PublicKey,
  programId: PublicKey = CONCLAVE_PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), proposal.toBuffer(), voter.toBuffer()],
    programId,
  );
  return pda;
}

export function getMessagePda(
  room: PublicKey,
  sender: PublicKey,
  timestamp: number,
  programId: PublicKey = CONCLAVE_PROGRAM_ID,
): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(timestamp), 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("message"), room.toBuffer(), sender.toBuffer(), buf],
    programId,
  );
  return pda;
}

export interface DaoRoomAccount {
  authority: PublicKey;
  governanceMint: PublicKey;
  name: string;
  memberCount: number;
  proposalCount: number;
  createdAt: number;
  bump: number;
}

export interface ProposalAccount {
  room: PublicKey;
  creator: PublicKey;
  title: string;
  description: string;
  voteYesCount: number;
  voteNoCount: number;
  deadline: number;
  isFinalized: boolean;
  bump: number;
  voteMode: number;    // 0 = standard, 1 = quadratic
  totalCredits: number; // voice credits per voter (quadratic only)
}

export interface MemberAccount {
  wallet: PublicKey;
  room: PublicKey;
  encryptedGroupKey: number[];
  joinedAt: number;
  bump: number;
}
