use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use crate::state::DaoRoom;
use crate::errors::ConclaveError;
use crate::events::RoomCreated;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub governance_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,

    #[account(
        init,
        payer = authority,
        space = DaoRoom::SPACE,
        seeds = [b"room", authority.key().as_ref(), name.as_bytes()],
        bump,
    )]
    pub room: Account<'info, DaoRoom>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateRoom>, name: String) -> Result<()> {
    require!(
        name.len() <= DaoRoom::MAX_NAME_LEN,
        ConclaveError::NameTooLong
    );
    require!(!name.is_empty(), ConclaveError::NameEmpty);

    let clock = Clock::get()?;
    let room = &mut ctx.accounts.room;
    room.authority = ctx.accounts.authority.key();
    room.governance_mint = ctx.accounts.governance_mint.key();
    room.name = name.clone();
    room.member_count = 0;
    room.proposal_count = 0;
    room.created_at = clock.unix_timestamp;
    room.bump = ctx.bumps.room;

    emit!(RoomCreated {
        room: room.key(),
        authority: ctx.accounts.authority.key(),
        governance_mint: ctx.accounts.governance_mint.key(),
        name,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
