use anchor_lang::prelude::*;

#[account]
pub struct DaoRoom {
    pub authority: Pubkey,
    pub governance_mint: Pubkey,
    pub name: String,
    pub member_count: u32,
    pub proposal_count: u32,
    pub created_at: i64,
    pub bump: u8,
}

impl DaoRoom {
    pub const MAX_NAME_LEN: usize = 50;

    pub const SPACE: usize = 8  // discriminator
        + 32                     // authority
        + 32                     // governance_mint
        + 4 + Self::MAX_NAME_LEN // name (string prefix + data)
        + 4                      // member_count
        + 4                      // proposal_count
        + 8                      // created_at
        + 1;                     // bump
}
