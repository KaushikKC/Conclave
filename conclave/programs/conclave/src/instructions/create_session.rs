use anchor_lang::prelude::*;
use crate::state::{DaoRoom, Member, Session};
use crate::events::SessionCreated;

#[derive(Accounts)]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    pub room: Account<'info, DaoRoom>,

    /// Validates the wallet is a member of this room
    #[account(
        seeds = [b"member", room.key().as_ref(), wallet.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,

    #[account(
        init,
        payer = wallet,
        space = Session::SPACE,
        seeds = [b"session", room.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub session: Account<'info, Session>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateSession>,
    session_key: Pubkey,
    expires_at: i64,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        expires_at > clock.unix_timestamp,
        crate::errors::ConclaveError::SessionExpiryInPast
    );

    let session = &mut ctx.accounts.session;
    session.owner = ctx.accounts.wallet.key();
    session.session_key = session_key;
    session.room = ctx.accounts.room.key();
    session.expires_at = expires_at;
    session.bump = ctx.bumps.session;

    emit!(SessionCreated {
        room: ctx.accounts.room.key(),
        owner: ctx.accounts.wallet.key(),
        session_key,
        expires_at,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
