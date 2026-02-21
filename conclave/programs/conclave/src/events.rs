use anchor_lang::prelude::*;

#[event]
pub struct RoomCreated {
    pub room: Pubkey,
    pub authority: Pubkey,
    pub governance_mint: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct MemberJoined {
    pub room: Pubkey,
    pub wallet: Pubkey,
    pub member_count: u32,
    pub timestamp: i64,
}

#[event]
pub struct ProposalCreated {
    pub room: Pubkey,
    pub proposal: Pubkey,
    pub creator: Pubkey,
    pub title: String,
    pub deadline: i64,
    pub timestamp: i64,
}

#[event]
pub struct VoteCast {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VoteRevealed {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub vote_choice: u8,
    pub vote_yes_count: u32,
    pub vote_no_count: u32,
    pub timestamp: i64,
}

#[event]
pub struct MessageSent {
    pub room: Pubkey,
    pub sender: Pubkey,
    pub message: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProposalFinalized {
    pub proposal: Pubkey,
    pub room: Pubkey,
    pub vote_yes_count: u32,
    pub vote_no_count: u32,
    pub timestamp: i64,
}

#[event]
pub struct MemberKeyUpdated {
    pub room: Pubkey,
    pub wallet: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct QuadraticVoteRevealed {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub vote_count: u32,
    pub vote_choice: u8,
    pub vote_yes_count: u32,
    pub vote_no_count: u32,
    pub timestamp: i64,
}
