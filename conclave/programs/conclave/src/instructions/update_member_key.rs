use anchor_lang::prelude::*;
use crate::state::{DaoRoom, Member};
use crate::errors::ConclaveError;
use crate::events::MemberKeyUpdated;

#[derive(Accounts)]
pub struct UpdateMemberKey<'info> {
    pub wallet: Signer<'info>,

    pub room: Account<'info, DaoRoom>,

    #[account(
        mut,
        seeds = [b"member", room.key().as_ref(), wallet.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == wallet.key(),
    )]
    pub member: Account<'info, Member>,
}

pub fn handler(ctx: Context<UpdateMemberKey>, new_encrypted_group_key: Vec<u8>) -> Result<()> {
    require!(
        new_encrypted_group_key.len() <= Member::MAX_ENCRYPTED_KEY_LEN,
        ConclaveError::EncryptedKeyTooLong
    );

    ctx.accounts.member.encrypted_group_key = new_encrypted_group_key;

    let clock = Clock::get()?;
    emit!(MemberKeyUpdated {
        room: ctx.accounts.room.key(),
        wallet: ctx.accounts.wallet.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
