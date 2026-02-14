use anchor_lang::prelude::*;
use crate::state::Proposal;
use crate::errors::ConclaveError;
use crate::events::ProposalFinalized;

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = !proposal.is_finalized @ ConclaveError::AlreadyFinalized,
    )]
    pub proposal: Account<'info, Proposal>,
}

pub fn handler(ctx: Context<FinalizeProposal>) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.proposal.deadline,
        ConclaveError::DeadlineNotReached
    );

    let proposal = &mut ctx.accounts.proposal;
    proposal.is_finalized = true;

    emit!(ProposalFinalized {
        proposal: proposal.key(),
        room: proposal.room,
        vote_yes_count: proposal.vote_yes_count,
        vote_no_count: proposal.vote_no_count,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
