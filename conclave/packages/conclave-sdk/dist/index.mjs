// src/client.ts
async function fetchJSON(baseUrl, path) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Not found");
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}
var ConclaveClient = class {
  constructor(baseUrl = "http://localhost:3001") {
    this.baseUrl = baseUrl;
  }
  /** List all rooms */
  async getRooms() {
    return fetchJSON(this.baseUrl, "/rooms");
  }
  /** Get a single room by address */
  async getRoom(address) {
    return fetchJSON(this.baseUrl, `/rooms/${address}`);
  }
  /** Get members of a room */
  async getRoomMembers(roomAddress) {
    return fetchJSON(this.baseUrl, `/rooms/${roomAddress}/members`);
  }
  /** Get messages (paginated). `before` is unix timestamp; default limit 50, max 200. */
  async getRoomMessages(roomAddress, opts) {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.before != null) params.set("before", String(opts.before));
    const qs = params.toString();
    return fetchJSON(
      this.baseUrl,
      `/rooms/${roomAddress}/messages${qs ? `?${qs}` : ""}`
    );
  }
  /** Get proposals for a room */
  async getRoomProposals(roomAddress) {
    return fetchJSON(this.baseUrl, `/rooms/${roomAddress}/proposals`);
  }
  /** Get a single proposal */
  async getProposal(address) {
    return fetchJSON(this.baseUrl, `/proposals/${address}`);
  }
  /** Get vote commitments for a proposal */
  async getProposalVotes(proposalAddress) {
    return fetchJSON(this.baseUrl, `/proposals/${proposalAddress}/votes`);
  }
  /** Get group key for a room (base64). Returns null if not available. */
  async getGroupKey(roomAddress) {
    try {
      const data = await fetchJSON(
        this.baseUrl,
        `/rooms/${roomAddress}/key`
      );
      return data.groupKey ?? null;
    } catch {
      return null;
    }
  }
  /** Get rooms where a wallet is a member */
  async getRoomsForWallet(walletAddress) {
    return fetchJSON(this.baseUrl, `/members/${walletAddress}/rooms`);
  }
  /** Get anonymous reputation for a wallet */
  async getReputation(walletAddress) {
    try {
      return await fetchJSON(
        this.baseUrl,
        `/reputation/${walletAddress}`
      );
    } catch {
      return null;
    }
  }
  /** Get ZK identity commitments for a room (for proof verification) */
  async getZKGroup(roomPda) {
    try {
      const data = await fetchJSON(
        this.baseUrl,
        `/zk/group/${roomPda}`
      );
      return data.commitments ?? [];
    } catch {
      return [];
    }
  }
};

// src/pdas.ts
import { PublicKey } from "@solana/web3.js";
var CONCLAVE_PROGRAM_ID = new PublicKey(
  "E5HrS48LBddCwXGdq4ULPB8bC8rihUReDmu9eRiPQieU"
);
function getRoomPda(authority, name, programId = CONCLAVE_PROGRAM_ID) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("room"), authority.toBuffer(), Buffer.from(name)],
    programId
  );
  return pda;
}
function getMemberPda(room, wallet, programId = CONCLAVE_PROGRAM_ID) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), room.toBuffer(), wallet.toBuffer()],
    programId
  );
  return pda;
}
function getProposalPda(room, title, programId = CONCLAVE_PROGRAM_ID) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), room.toBuffer(), Buffer.from(title)],
    programId
  );
  return pda;
}
function getVoteCommitmentPda(proposal, voter, programId = CONCLAVE_PROGRAM_ID) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), proposal.toBuffer(), voter.toBuffer()],
    programId
  );
  return pda;
}
function getMessagePda(room, sender, timestamp, programId = CONCLAVE_PROGRAM_ID) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(timestamp), 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("message"),
      room.toBuffer(),
      sender.toBuffer(),
      buf
    ],
    programId
  );
  return pda;
}
function getSessionPda(room, owner, programId = CONCLAVE_PROGRAM_ID) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("session"), room.toBuffer(), owner.toBuffer()],
    programId
  );
  return pda;
}
function getTreasuryPda(room, programId = CONCLAVE_PROGRAM_ID) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), room.toBuffer()],
    programId
  );
  return pda;
}
export {
  CONCLAVE_PROGRAM_ID,
  ConclaveClient,
  getMemberPda,
  getMessagePda,
  getProposalPda,
  getRoomPda,
  getSessionPda,
  getTreasuryPda,
  getVoteCommitmentPda
};
