use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod state;
pub mod instructions;

pub use instructions::create_room::*;
pub use instructions::join_room::*;
pub use instructions::create_proposal::*;
pub use instructions::cast_vote::*;
pub use instructions::reveal_vote::*;
pub use instructions::send_message::*;
pub use instructions::finalize_proposal::*;
pub use instructions::close_message::*;
pub use instructions::close_vote::*;
pub use instructions::update_member_key::*;

declare_id!("E5HrS48LBddCwXGdq4ULPB8bC8rihUReDmu9eRiPQieU");

#[program]
pub mod conclave {
    use super::*;

    pub fn create_room(ctx: Context<CreateRoom>, name: String) -> Result<()> {
        instructions::create_room::handler(ctx, name)
    }

    pub fn join_room(ctx: Context<JoinRoom>, encrypted_group_key: Vec<u8>) -> Result<()> {
        instructions::join_room::handler(ctx, encrypted_group_key)
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        deadline: i64,
    ) -> Result<()> {
        instructions::create_proposal::handler(ctx, title, description, deadline)
    }

    pub fn cast_vote(ctx: Context<CastVote>, commitment: [u8; 32]) -> Result<()> {
        instructions::cast_vote::handler(ctx, commitment)
    }

    pub fn reveal_vote(
        ctx: Context<RevealVote>,
        vote_choice: u8,
        nonce: [u8; 32],
    ) -> Result<()> {
        instructions::reveal_vote::handler(ctx, vote_choice, nonce)
    }

    pub fn send_message(
        ctx: Context<SendMessage>,
        ciphertext: Vec<u8>,
        timestamp: i64,
    ) -> Result<()> {
        instructions::send_message::handler(ctx, ciphertext, timestamp)
    }

    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        instructions::finalize_proposal::handler(ctx)
    }

    pub fn close_message(ctx: Context<CloseMessage>) -> Result<()> {
        instructions::close_message::handler(ctx)
    }

    pub fn close_vote(ctx: Context<CloseVote>) -> Result<()> {
        instructions::close_vote::handler(ctx)
    }

    pub fn update_member_key(
        ctx: Context<UpdateMemberKey>,
        new_encrypted_group_key: Vec<u8>,
    ) -> Result<()> {
        instructions::update_member_key::handler(ctx, new_encrypted_group_key)
    }
}
