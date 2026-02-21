use anchor_lang::prelude::*;
use crate::state::{DaoRoom, Proposal, Treasury};
use crate::errors::ConclaveError;
use crate::events::ProposalActionExecuted;

/// Execute a treasury transfer for a passed + finalized proposal.
/// Room authority specifies recipient and amount — governance gives proposals "teeth".
#[derive(Accounts)]
pub struct ExecuteProposalAction<'info> {
    pub authority: Signer<'info>,

    #[account(
        constraint = room.authority == authority.key() @ ConclaveError::UnauthorizedAuthority,
    )]
    pub room: Account<'info, DaoRoom>,

    #[account(
        constraint = proposal.room == room.key() @ ConclaveError::UnauthorizedAuthority,
        constraint = proposal.is_finalized @ ConclaveError::NotFinalized,
        constraint = proposal.vote_yes_count > proposal.vote_no_count @ ConclaveError::ProposalNotPassed,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        seeds = [b"treasury", room.key().as_ref()],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    /// CHECK: recipient address set by the room authority
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ExecuteProposalAction>, amount: u64) -> Result<()> {
    require!(amount > 0, ConclaveError::InvalidAmount);

    // Ensure treasury retains rent-exemption minimum
    let treasury_info = ctx.accounts.treasury.to_account_info();
    let rent_min = Rent::get()?.minimum_balance(Treasury::SPACE);
    let available = treasury_info
        .lamports()
        .checked_sub(rent_min)
        .ok_or(ConclaveError::InsufficientTreasury)?;
    require!(available >= amount, ConclaveError::InsufficientTreasury);

    // Direct lamport transfer: treasury (program-owned) → recipient
    **treasury_info.try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.recipient.to_account_info().try_borrow_mut_lamports()? += amount;

    emit!(ProposalActionExecuted {
        room: ctx.accounts.room.key(),
        proposal: ctx.accounts.proposal.key(),
        recipient: ctx.accounts.recipient.key(),
        amount,
    });

    Ok(())
}
