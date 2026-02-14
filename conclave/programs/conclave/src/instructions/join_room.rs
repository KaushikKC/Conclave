use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};
use crate::state::{DaoRoom, Member};
use crate::errors::ConclaveError;
use crate::events::MemberJoined;

#[derive(Accounts)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(mut)]
    pub room: Account<'info, DaoRoom>,

    #[account(
        constraint = token_account.mint == room.governance_mint,
        constraint = token_account.owner == wallet.key(),
        constraint = token_account.amount >= 1 @ ConclaveError::InsufficientTokens,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = wallet,
        space = Member::SPACE,
        seeds = [b"member", room.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub member: Account<'info, Member>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<JoinRoom>, encrypted_group_key: Vec<u8>) -> Result<()> {
    require!(
        encrypted_group_key.len() <= Member::MAX_ENCRYPTED_KEY_LEN,
        ConclaveError::EncryptedKeyTooLong
    );

    let clock = Clock::get()?;
    let member = &mut ctx.accounts.member;
    member.wallet = ctx.accounts.wallet.key();
    member.room = ctx.accounts.room.key();
    member.encrypted_group_key = encrypted_group_key;
    member.joined_at = clock.unix_timestamp;
    member.bump = ctx.bumps.member;

    let room = &mut ctx.accounts.room;
    room.member_count = room.member_count.checked_add(1).unwrap();

    emit!(MemberJoined {
        room: room.key(),
        wallet: ctx.accounts.wallet.key(),
        member_count: room.member_count,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
