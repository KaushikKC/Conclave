use anchor_lang::prelude::*;

#[account]
pub struct Member {
    pub wallet: Pubkey,
    pub room: Pubkey,
    pub encrypted_group_key: Vec<u8>,
    pub joined_at: i64,
    pub bump: u8,
}

impl Member {
    pub const MAX_ENCRYPTED_KEY_LEN: usize = 128;

    pub const SPACE: usize = 8  // discriminator
        + 32                     // wallet
        + 32                     // room
        + 4 + Self::MAX_ENCRYPTED_KEY_LEN // encrypted_group_key
        + 8                      // joined_at
        + 1;                     // bump
}
