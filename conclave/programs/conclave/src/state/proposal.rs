use anchor_lang::prelude::*;

#[account]
pub struct Proposal {
    pub room: Pubkey,
    pub creator: Pubkey,
    pub title: String,
    pub description: String,
    pub vote_yes_count: u32,
    pub vote_no_count: u32,
    pub deadline: i64,
    pub is_finalized: bool,
    pub bump: u8,
}

impl Proposal {
    pub const MAX_TITLE_LEN: usize = 100;
    pub const MAX_DESC_LEN: usize = 500;

    pub const SPACE: usize = 8  // discriminator
        + 32                     // room
        + 32                     // creator
        + 4 + Self::MAX_TITLE_LEN  // title
        + 4 + Self::MAX_DESC_LEN   // description
        + 4                      // vote_yes_count
        + 4                      // vote_no_count
        + 8                      // deadline
        + 1                      // is_finalized
        + 1;                     // bump
}

#[account]
pub struct VoteCommitment {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub commitment: [u8; 32],
    pub is_revealed: bool,
    pub bump: u8,
}

impl VoteCommitment {
    pub const SPACE: usize = 8  // discriminator
        + 32                     // voter
        + 32                     // proposal
        + 32                     // commitment
        + 1                      // is_revealed
        + 1;                     // bump
}
