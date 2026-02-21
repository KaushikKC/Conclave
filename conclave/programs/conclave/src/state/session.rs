use anchor_lang::prelude::*;

/// Delegates chat authority to a temporary ephemeral keypair stored in the browser.
/// PDA: ["session", room, owner_wallet]
#[account]
pub struct Session {
    /// The real member wallet that created this session
    pub owner: Pubkey,
    /// The ephemeral local keypair allowed to sign on behalf of owner
    pub session_key: Pubkey,
    /// Which room this session is valid for
    pub room: Pubkey,
    /// Unix timestamp when this session expires
    pub expires_at: i64,
    pub bump: u8,
}

impl Session {
    pub const SPACE: usize = 8  // discriminator
        + 32                    // owner
        + 32                    // session_key
        + 32                    // room
        + 8                     // expires_at
        + 1;                    // bump
}
