import { PublicKey } from '@solana/web3.js';

/** Room from Conclave indexer */
interface ApiRoom {
    address: string;
    authority: string;
    governance_mint: string;
    name: string;
    member_count: number;
    proposal_count: number;
    created_at: number;
    indexed_at: number;
    realm_address: string | null;
}
/** Member from indexer */
interface ApiMember {
    address: string;
    wallet: string;
    room: string;
    joined_at: number;
    indexed_at: number;
}
/** Message from indexer (ciphertext is base64) */
interface ApiMessage {
    address: string;
    room: string;
    sender: string;
    ciphertext: string;
    timestamp: number;
    indexed_at: number;
}
/** Proposal from indexer */
interface ApiProposal {
    address: string;
    room: string;
    creator: string;
    title: string;
    description: string;
    vote_yes_count: number;
    vote_no_count: number;
    deadline: number;
    is_finalized: number;
    indexed_at: number;
}
/** Vote commitment from indexer */
interface ApiVoteCommitment {
    address: string;
    voter: string;
    proposal: string;
    is_revealed: number;
    indexed_at: number;
}
/** Anonymous reputation (indexer) */
interface ApiReputation {
    votes_cast: number;
    proposals_created: number;
    messages_sent: number;
    total: number;
    tier: "none" | "bronze" | "silver" | "gold";
}

/**
 * Conclave indexer API client. Use this to build bots, dashboards, or third-party integrations.
 */
declare class ConclaveClient {
    readonly baseUrl: string;
    constructor(baseUrl?: string);
    /** List all rooms */
    getRooms(): Promise<ApiRoom[]>;
    /** Get a single room by address */
    getRoom(address: string): Promise<ApiRoom>;
    /** Get members of a room */
    getRoomMembers(roomAddress: string): Promise<ApiMember[]>;
    /** Get messages (paginated). `before` is unix timestamp; default limit 50, max 200. */
    getRoomMessages(roomAddress: string, opts?: {
        limit?: number;
        before?: number;
    }): Promise<ApiMessage[]>;
    /** Get proposals for a room */
    getRoomProposals(roomAddress: string): Promise<ApiProposal[]>;
    /** Get a single proposal */
    getProposal(address: string): Promise<ApiProposal>;
    /** Get vote commitments for a proposal */
    getProposalVotes(proposalAddress: string): Promise<ApiVoteCommitment[]>;
    /** Get group key for a room (base64). Returns null if not available. */
    getGroupKey(roomAddress: string): Promise<string | null>;
    /** Get rooms where a wallet is a member */
    getRoomsForWallet(walletAddress: string): Promise<ApiRoom[]>;
    /** Get anonymous reputation for a wallet */
    getReputation(walletAddress: string): Promise<ApiReputation | null>;
    /** Get ZK identity commitments for a room (for proof verification) */
    getZKGroup(roomPda: string): Promise<string[]>;
}

/** Conclave program ID (devnet) */
declare const CONCLAVE_PROGRAM_ID: PublicKey;
/** Room PDA: ["room", authority, name] */
declare function getRoomPda(authority: PublicKey, name: string, programId?: PublicKey): PublicKey;
/** Member PDA: ["member", room, wallet] */
declare function getMemberPda(room: PublicKey, wallet: PublicKey, programId?: PublicKey): PublicKey;
/** Proposal PDA: ["proposal", room, title] */
declare function getProposalPda(room: PublicKey, title: string, programId?: PublicKey): PublicKey;
/** Vote commitment PDA: ["vote", proposal, voter] */
declare function getVoteCommitmentPda(proposal: PublicKey, voter: PublicKey, programId?: PublicKey): PublicKey;
/** Message PDA: ["message", room, sender, timestamp_le_bytes] */
declare function getMessagePda(room: PublicKey, sender: PublicKey, timestamp: number, programId?: PublicKey): PublicKey;
/** Session PDA: ["session", room, owner] */
declare function getSessionPda(room: PublicKey, owner: PublicKey, programId?: PublicKey): PublicKey;
/** Treasury PDA: ["treasury", room] */
declare function getTreasuryPda(room: PublicKey, programId?: PublicKey): PublicKey;

export { type ApiMember, type ApiMessage, type ApiProposal, type ApiReputation, type ApiRoom, type ApiVoteCommitment, CONCLAVE_PROGRAM_ID, ConclaveClient, getMemberPda, getMessagePda, getProposalPda, getRoomPda, getSessionPda, getTreasuryPda, getVoteCommitmentPda };
