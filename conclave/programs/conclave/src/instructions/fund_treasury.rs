use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{DaoRoom, Treasury};
use crate::events::TreasuryFunded;

/// Transfer SOL from any funder into the room treasury.
#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,

    pub room: Account<'info, DaoRoom>,

    #[account(
        mut,
        seeds = [b"treasury", room.key().as_ref()],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
    require!(amount > 0, crate::errors::ConclaveError::InvalidAmount);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.funder.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(TreasuryFunded {
        room: ctx.accounts.room.key(),
        funder: ctx.accounts.funder.key(),
        amount,
    });

    Ok(())
}
