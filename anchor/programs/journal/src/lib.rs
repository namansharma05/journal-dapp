#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

mod blueprints;
mod contexts;
use contexts::*;
declare_id!("91be9qkpnxDk6vrFc1fpxz7pxB3Ec5aAhgVussaw1VSj");

#[program]
pub mod journal {
    use super::*;

    pub fn initialize_counter(ctx: Context<InitializeCounter>) -> Result<()> {
        let journal_entry_counter_account = &mut ctx.accounts.journal_entry_counter_account;

        journal_entry_counter_account.count = 0;
        Ok(())
    }
    pub fn create_journal_entry(
        ctx: Context<CreateEntry>,
        title: String,
        message: String,
    ) -> Result<()> {
        let journal_entry_account = &mut ctx.accounts.journal_entry_account;
        let journal_entry_counter_account = &mut ctx.accounts.journal_entry_counter_account;

        journal_entry_account.owner = ctx.accounts.signer.key();
        journal_entry_account.title = title;
        journal_entry_account.message = message;

        journal_entry_counter_account.count += 1;
        Ok(())
    }

    pub fn update_journal_entry(
        ctx: Context<UpdateEntry>,
        title: String,
        message: String,
        _count: u32,
    ) -> Result<()> {
        let journal_entry_account = &mut ctx.accounts.journal_entry_account;
        journal_entry_account.title = title;
        journal_entry_account.message = message;
        Ok(())
    }

    pub fn delete_journal_entry(_ctx: Context<DeleteEntry>, _count: u32) -> Result<()> {
        Ok(())
    }
}
