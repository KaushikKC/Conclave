use anchor_lang::prelude::*;
use crate::state::{DaoRoom, Member, Message, Session};
use crate::errors::ConclaveError;
use crate::events::MessageSent;

/// Send a message using a session key — no wallet popup required.
/// The session_key (ephemeral local keypair) signs the tx and pays fees.
/// The message is attributed to session.owner (the real wallet).
#[derive(Accounts)]
#[instruction(ciphertext: Vec<u8>, timestamp: i64)]
pub struct SendMessageWithSession<'info> {
    /// The ephemeral session keypair — signs and pays fees, no wallet popup
    #[account(mut)]
    pub session_key: Signer<'info>,

    pub room: Account<'info, DaoRoom>,

    /// The real member wallet. Not a signer — session proves authorization.
    /// CHECK: validated via session.owner == owner.key()
    pub owner: UncheckedAccount<'info>,

    /// Session PDA — proves session_key has permission to act for owner in this room
    #[account(
        seeds = [b"session", room.key().as_ref(), owner.key().as_ref()],
        bump = session.bump,
        constraint = session.session_key == session_key.key() @ ConclaveError::SessionKeyMismatch,
    )]
    pub session: Account<'info, Session>,

    /// Validates owner is a room member
    #[account(
        seeds = [b"member", room.key().as_ref(), owner.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,

    /// Message attributed to owner (real wallet), paid by session_key
    #[account(
        init,
        payer = session_key,
        space = Message::SPACE,
        seeds = [b"message", room.key().as_ref(), owner.key().as_ref(), &timestamp.to_le_bytes()],
        bump,
    )]
    pub message: Account<'info, Message>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SendMessageWithSession>,
    ciphertext: Vec<u8>,
    timestamp: i64,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        ctx.accounts.session.expires_at > clock.unix_timestamp,
        ConclaveError::SessionExpired
    );
    require!(
        ciphertext.len() <= Message::MAX_CIPHERTEXT_LEN,
        ConclaveError::CiphertextTooLong
    );

    let owner_key = ctx.accounts.owner.key();

    let message = &mut ctx.accounts.message;
    message.room = ctx.accounts.room.key();
    message.sender = owner_key; // attributed to real wallet — same anonymous alias
    message.ciphertext = ciphertext;
    message.timestamp = timestamp;
    message.bump = ctx.bumps.message;

    emit!(MessageSent {
        room: ctx.accounts.room.key(),
        sender: owner_key,
        message: message.key(),
        timestamp,
    });

    Ok(())
}
