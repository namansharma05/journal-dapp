use anchor_lang::prelude::*;

use crate::blueprints::*;

#[derive(Accounts)]
#[instruction(count: u32)]
pub struct DeleteEntry<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"journal-entry", count.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump,
        close = signer,
    )]
    pub journal_entry_account: Account<'info, JournalEntryState>,
}

#[derive(Accounts)]
#[instruction(count: u32)]
pub struct UpdateEntry<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"journal-entry", count.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump,
        realloc = 8 + JournalEntryState::INIT_SPACE,
        realloc::payer = signer,
        realloc::zero = false,
    )]
    pub journal_entry_account: Account<'info, JournalEntryState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeCounter<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + JournalEntryCounterState::INIT_SPACE,
        seeds = [b"journal-counter"],
        bump,
    )]
    pub journal_entry_counter_account: Account<'info, JournalEntryCounterState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEntry<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"journal-counter"],
        bump,
    )]
    pub journal_entry_counter_account: Account<'info, JournalEntryCounterState>,

    #[account(
        init,
        payer = signer,
        space = 8 + JournalEntryState::INIT_SPACE,
        seeds = [b"journal-entry", journal_entry_counter_account.count.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump,
    )]
    pub journal_entry_account: Account<'info, JournalEntryState>,

    pub system_program: Program<'info, System>,
}
