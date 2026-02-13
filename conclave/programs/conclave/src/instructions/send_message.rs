use anchor_lang::prelude::*;
use crate::state::{DaoRoom, Member, Message};
use crate::errors::ConclaveError;

#[derive(Accounts)]
#[instruction(ciphertext: Vec<u8>, timestamp: i64)]
pub struct SendMessage<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    pub room: Account<'info, DaoRoom>,

    #[account(
        seeds = [b"member", room.key().as_ref(), sender.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,

    #[account(
        init,
        payer = sender,
        space = Message::SPACE,
        seeds = [b"message", room.key().as_ref(), sender.key().as_ref(), &timestamp.to_le_bytes()],
        bump,
    )]
    pub message: Account<'info, Message>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SendMessage>, ciphertext: Vec<u8>, timestamp: i64) -> Result<()> {
    require!(
        ciphertext.len() <= Message::MAX_CIPHERTEXT_LEN,
        ConclaveError::CiphertextTooLong
    );

    let message = &mut ctx.accounts.message;
    message.room = ctx.accounts.room.key();
    message.sender = ctx.accounts.sender.key();
    message.ciphertext = ciphertext;
    message.timestamp = timestamp;
    message.bump = ctx.bumps.message;

    Ok(())
}
