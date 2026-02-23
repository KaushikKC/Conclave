/** Room from Conclave indexer */
export interface ApiRoom {
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
export interface ApiMember {
  address: string;
  wallet: string;
  room: string;
  joined_at: number;
  indexed_at: number;
}

/** Message from indexer (ciphertext is base64) */
export interface ApiMessage {
  address: string;
  room: string;
  sender: string;
  ciphertext: string;
  timestamp: number;
  indexed_at: number;
}

/** Proposal from indexer */
export interface ApiProposal {
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
export interface ApiVoteCommitment {
  address: string;
  voter: string;
  proposal: string;
  is_revealed: number;
  indexed_at: number;
}

/** Anonymous reputation (indexer) */
export interface ApiReputation {
  votes_cast: number;
  proposals_created: number;
  messages_sent: number;
  total: number;
  tier: "none" | "bronze" | "silver" | "gold";
}
