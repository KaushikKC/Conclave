use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use crate::state::DaoRoom;
use crate::errors::ConclaveError;

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

    let room = &mut ctx.accounts.room;
    room.authority = ctx.accounts.authority.key();
    room.governance_mint = ctx.accounts.governance_mint.key();
    room.name = name;
    room.member_count = 0;
    room.proposal_count = 0;
    room.created_at = Clock::get()?.unix_timestamp;
    room.bump = ctx.bumps.room;

    Ok(())
}
