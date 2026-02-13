use anchor_lang::prelude::*;

#[error_code]
pub enum ConclaveError {
    #[msg("Room name exceeds maximum length of 50 characters")]
    NameTooLong,
    #[msg("Room name cannot be empty")]
    NameEmpty,
    #[msg("Insufficient governance tokens to join room")]
    InsufficientTokens,
    #[msg("Message ciphertext exceeds maximum size of 1024 bytes")]
    CiphertextTooLong,
    #[msg("Proposal title exceeds maximum length")]
    TitleTooLong,
    #[msg("Proposal description exceeds maximum length")]
    DescriptionTooLong,
    #[msg("Voting deadline has passed")]
    DeadlinePassed,
    #[msg("Voting deadline has not passed yet")]
    DeadlineNotReached,
    #[msg("Vote has already been revealed")]
    AlreadyRevealed,
    #[msg("Commitment hash does not match revealed vote")]
    CommitmentMismatch,
    #[msg("Invalid vote choice, must be 1 (yes) or 0 (no)")]
    InvalidVoteChoice,
    #[msg("Encrypted group key exceeds maximum size")]
    EncryptedKeyTooLong,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
}
