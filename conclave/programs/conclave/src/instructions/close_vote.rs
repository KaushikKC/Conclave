use anchor_lang::prelude::*;
use crate::state::{Proposal, VoteCommitment};
use crate::errors::ConclaveError;

#[derive(Accounts)]
pub struct CloseVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    #[account(
        constraint = proposal.is_finalized @ ConclaveError::NotFinalized,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        close = voter,
        constraint = vote_commitment.voter == voter.key(),
        constraint = vote_commitment.is_revealed @ ConclaveError::VoteNotRevealed,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump = vote_commitment.bump,
    )]
    pub vote_commitment: Account<'info, VoteCommitment>,
}

pub fn handler(_ctx: Context<CloseVote>) -> Result<()> {
    Ok(())
}
