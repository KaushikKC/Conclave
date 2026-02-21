use anchor_lang::prelude::*;
use crate::state::{DaoRoom, Member, Proposal};
use crate::errors::ConclaveError;
use crate::events::ProposalCreated;

#[derive(Accounts)]
#[instruction(title: String, _description: String)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub room: Account<'info, DaoRoom>,

    #[account(
        seeds = [b"member", room.key().as_ref(), creator.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,

    #[account(
        init,
        payer = creator,
        space = Proposal::SPACE,
        seeds = [b"proposal", room.key().as_ref(), title.as_bytes()],
        bump,
    )]
    pub proposal: Account<'info, Proposal>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateProposal>,
    title: String,
    description: String,
    deadline: i64,
    vote_mode: u8,
    total_credits: u32,
) -> Result<()> {
    require!(
        title.len() <= Proposal::MAX_TITLE_LEN,
        ConclaveError::TitleTooLong
    );
    require!(
        description.len() <= Proposal::MAX_DESC_LEN,
        ConclaveError::DescriptionTooLong
    );
    require!(
        vote_mode == 0 || vote_mode == 1,
        ConclaveError::InvalidVoteMode
    );
    // Quadratic mode requires at least 1 credit
    if vote_mode == 1 {
        require!(total_credits >= 1, ConclaveError::InsufficientCredits);
    }

    let clock = Clock::get()?;
    require!(deadline > clock.unix_timestamp, ConclaveError::DeadlineInPast);

    let proposal = &mut ctx.accounts.proposal;
    proposal.room = ctx.accounts.room.key();
    proposal.creator = ctx.accounts.creator.key();
    proposal.title = title.clone();
    proposal.description = description;
    proposal.vote_yes_count = 0;
    proposal.vote_no_count = 0;
    proposal.deadline = deadline;
    proposal.is_finalized = false;
    proposal.bump = ctx.bumps.proposal;
    proposal.vote_mode = vote_mode;
    proposal.total_credits = total_credits;

    let room = &mut ctx.accounts.room;
    room.proposal_count = room.proposal_count.checked_add(1).unwrap();

    emit!(ProposalCreated {
        room: room.key(),
        proposal: proposal.key(),
        creator: ctx.accounts.creator.key(),
        title,
        deadline,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
