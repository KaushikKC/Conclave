use anchor_lang::prelude::*;
use sha2::{Sha256, Digest};
use crate::state::{Proposal, VoteCommitment};
use crate::errors::ConclaveError;

#[derive(Accounts)]
pub struct RevealVote<'info> {
    pub voter: Signer<'info>,

    #[account(mut)]
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

pub fn handler(ctx: Context<RevealVote>, vote_choice: u8, nonce: [u8; 32]) -> Result<()> {
    require!(
        vote_choice == 0 || vote_choice == 1,
        ConclaveError::InvalidVoteChoice
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.proposal.deadline,
        ConclaveError::DeadlineNotReached
    );

    let mut hasher = Sha256::new();
    hasher.update([vote_choice]);
    hasher.update(nonce);
    let computed_hash: [u8; 32] = hasher.finalize().into();

    require!(
        computed_hash == ctx.accounts.vote_commitment.commitment,
        ConclaveError::CommitmentMismatch
    );

    let proposal = &mut ctx.accounts.proposal;
    if vote_choice == 1 {
        proposal.vote_yes_count = proposal.vote_yes_count.checked_add(1).unwrap();
    } else {
        proposal.vote_no_count = proposal.vote_no_count.checked_add(1).unwrap();
    }

    ctx.accounts.vote_commitment.is_revealed = true;

    Ok(())
}
