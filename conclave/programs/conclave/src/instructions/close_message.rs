use anchor_lang::prelude::*;
use crate::state::Message;
use crate::errors::ConclaveError;

#[derive(Accounts)]
pub struct CloseMessage<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        mut,
        close = sender,
        constraint = message.sender == sender.key() @ ConclaveError::UnauthorizedSender,
    )]
    pub message: Account<'info, Message>,
}

pub fn handler(_ctx: Context<CloseMessage>) -> Result<()> {
    Ok(())
}
