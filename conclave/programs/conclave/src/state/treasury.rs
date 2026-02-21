use anchor_lang::prelude::*;

/// SOL treasury for a DAO room — winning proposals can execute transfers from it.
/// PDA: ["treasury", room]
#[account]
pub struct Treasury {
    pub room: Pubkey,
    pub bump: u8,
}

impl Treasury {
    pub const SPACE: usize = 8  // discriminator
        + 32                    // room
        + 1;                    // bump
}
