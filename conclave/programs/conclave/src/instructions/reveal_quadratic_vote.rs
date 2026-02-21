use anchor_lang::prelude::*;
use sha2::{Sha256, Digest};
use crate::state::{Proposal, VoteCommitment};
use crate::errors::ConclaveError;
use crate::events::QuadraticVoteRevealed;

#[derive(Accounts)]
pub struct RevealQuadraticVote<'info> {
    pub voter: Signer<'info>,

    #[account(
        mut,
        constraint = !proposal.is_finalized @ ConclaveError::AlreadyFinalized,
        constraint = proposal.vote_mode == 1 @ ConclaveError::NotQuadraticProposal,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump = vote_commitment.bump,
        constraint = vote_commitment.voter == voter.key(),
        constraint = !vote_commitment.is_revealed @ ConclaveError::AlreadyRevealed,
    )]
    pub vote_commitment: Account<'info, VoteCommitment>,
}

/// Reveal a quadratic vote: voter committed sha256(vote_count_le || vote_choice || nonce).
/// vote_count votes cost vote_count² voice credits.
pub fn handler(
    ctx: Context<RevealQuadraticVote>,
    vote_count: u32,
    vote_choice: u8,
    nonce: [u8; 32],
) -> Result<()> {
    require!(
        vote_choice == 0 || vote_choice == 1,
        ConclaveError::InvalidVoteChoice
    );
    require!(vote_count >= 1, ConclaveError::InvalidVoteCount);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.proposal.deadline,
        ConclaveError::DeadlineNotReached
    );

    // Validate quadratic cost: vote_count² ≤ total_credits
    let cost = (vote_count as u64)
        .checked_mul(vote_count as u64)
        .ok_or(ConclaveError::InvalidVoteCount)?;
    require!(
        cost <= ctx.accounts.proposal.total_credits as u64,
        ConclaveError::InsufficientCredits
    );

    // Verify commitment: sha256(vote_count_le_bytes(4) || vote_choice(1) || nonce(32))
    let mut hasher = Sha256::new();
    hasher.update(vote_count.to_le_bytes());
    hasher.update([vote_choice]);
    hasher.update(nonce);
    let computed_hash: [u8; 32] = hasher.finalize().into();

    require!(
        computed_hash == ctx.accounts.vote_commitment.commitment,
        ConclaveError::CommitmentMismatch
    );

    let proposal = &mut ctx.accounts.proposal;
    if vote_choice == 1 {
        proposal.vote_yes_count = proposal.vote_yes_count.checked_add(vote_count).unwrap();
    } else {
        proposal.vote_no_count = proposal.vote_no_count.checked_add(vote_count).unwrap();
    }

    ctx.accounts.vote_commitment.is_revealed = true;

    emit!(QuadraticVoteRevealed {
        proposal: proposal.key(),
        voter: ctx.accounts.voter.key(),
        vote_count,
        vote_choice,
        vote_yes_count: proposal.vote_yes_count,
        vote_no_count: proposal.vote_no_count,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
