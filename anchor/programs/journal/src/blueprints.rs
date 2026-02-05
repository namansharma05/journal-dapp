use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct JournalEntryState {
    pub owner: Pubkey,
    #[max_len(50)]
    pub title: String,
    #[max_len(100)]
    pub message: String,
}

#[account]
#[derive(InitSpace)]
pub struct JournalEntryCounterState {
    pub count: u32,
}
