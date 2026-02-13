use anchor_lang::prelude::*;

#[account]
pub struct Message {
    pub room: Pubkey,
    pub sender: Pubkey,
    pub ciphertext: Vec<u8>,
    pub timestamp: i64,
    pub bump: u8,
}

impl Message {
    pub const MAX_CIPHERTEXT_LEN: usize = 1024;

    pub const SPACE: usize = 8  // discriminator
        + 32                     // room
        + 32                     // sender
        + 4 + Self::MAX_CIPHERTEXT_LEN // ciphertext
        + 8                      // timestamp
        + 1;                     // bump
}
