use anchor_lang::prelude::*;
use crate::state::{DaoRoom, Member, Proposal, VoteCommitment};
use crate::errors::ConclaveError;

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    pub room: Account<'info, DaoRoom>,

    #[account(
        seeds = [b"member", room.key().as_ref(), voter.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,

    #[account(
        constraint = proposal.room == room.key(),
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = voter,
        space = VoteCommitment::SPACE,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump,
    )]
    pub vote_commitment: Account<'info, VoteCommitment>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CastVote>, commitment: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.proposal.deadline,
        ConclaveError::DeadlinePassed
    );

    let vote = &mut ctx.accounts.vote_commitment;
    vote.voter = ctx.accounts.voter.key();
    vote.proposal = ctx.accounts.proposal.key();
    vote.commitment = commitment;
    vote.is_revealed = false;
    vote.bump = ctx.bumps.vote_commitment;

    Ok(())
}
