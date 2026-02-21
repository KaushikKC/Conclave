use anchor_lang::prelude::*;
use crate::state::{DaoRoom, Treasury};
use crate::errors::ConclaveError;

/// Creates the treasury PDA for a room. Only the room authority can call this.
#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        constraint = room.authority == authority.key() @ ConclaveError::UnauthorizedAuthority,
    )]
    pub room: Account<'info, DaoRoom>,

    #[account(
        init,
        payer = authority,
        space = Treasury::SPACE,
        seeds = [b"treasury", room.key().as_ref()],
        bump,
    )]
    pub treasury: Account<'info, Treasury>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitTreasury>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    treasury.room = ctx.accounts.room.key();
    treasury.bump = ctx.bumps.treasury;
    Ok(())
}
