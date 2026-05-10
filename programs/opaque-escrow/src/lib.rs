use anchor_lang::prelude::*;

declare_id!("Grmkz4pZa8Rc6SDzMtTsd6qR1nP6EKztwTw9rFaKBrUq");

#[program]
pub mod opaque_escrow {
    use super::*;

    pub fn create_escrow(ctx: Context<CreateEscrow>, amount: u64, threshold: u8) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.amount = amount;
        escrow.threshold = threshold;
        escrow.status = EscrowStatus::Pending;
        escrow.bump = ctx.bumps.escrow_state;

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;

        msg!("Escrow created. Buyer: {}, Seller: {}, Amount: {} lamports, Threshold: {}",
            escrow.buyer, escrow.seller, escrow.amount, escrow.threshold);

        Ok(())
    }

    pub fn verify_and_settle(ctx: Context<VerifyAndSettle>, signal_confidence: u8) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;

        require!(
            escrow.status == EscrowStatus::Pending,
            EscrowError::InvalidEscrowStatus
        );

        require!(
            signal_confidence >= escrow.threshold,
            EscrowError::ThresholdNotMet
        );

        escrow.status = EscrowStatus::Settled;

        let escrow_key = escrow.key();
        let vault_bump = ctx.bumps.vault;
        let seeds = &[b"vault", escrow_key.as_ref(), &[vault_bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.seller.to_account_info(),
            },
            signer_seeds,
        );
        anchor_lang::system_program::transfer(cpi_context, escrow.amount)?;

        msg!("Verification passed. Confidence: {}. Payment released to seller.", signal_confidence);

        Ok(())
    }

    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;

        require!(
            escrow.status == EscrowStatus::Pending,
            EscrowError::InvalidEscrowStatus
        );

        escrow.status = EscrowStatus::Cancelled;

        let escrow_key = escrow.key();
        let vault_bump = ctx.bumps.vault;
        let seeds = &[b"vault", escrow_key.as_ref(), &[vault_bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.buyer.to_account_info(),
            },
            signer_seeds,
        );
        anchor_lang::system_program::transfer(cpi_context, escrow.amount)?;

        msg!("Escrow cancelled. Funds refunded to buyer.");

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateEscrow<'info> {
    #[account(
        init,
        payer = buyer,
        space = EscrowState::LEN,
        seeds = [b"escrow", buyer.key().as_ref(), seller.key().as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"vault", escrow_state.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: seller is just a recipient pubkey
    pub seller: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyAndSettle<'info> {
    #[account(
        mut,
        seeds = [b"escrow", buyer.key().as_ref(), seller.key().as_ref()],
        bump = escrow_state.bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"vault", escrow_state.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: seller receives funds
    #[account(mut)]
    pub seller: AccountInfo<'info>,

    /// CHECK: buyer pubkey for PDA seed validation
    pub buyer: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", buyer.key().as_ref(), seller.key().as_ref()],
        bump = escrow_state.bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"vault", escrow_state.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: seller pubkey for PDA seed validation
    pub seller: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct EscrowState {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub threshold: u8,
    pub status: EscrowStatus,
    pub bump: u8,
}

impl EscrowState {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 2 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum EscrowStatus {
    Pending,
    Verified,
    Settled,
    Cancelled,
}

#[error_code]
pub enum EscrowError {
    #[msg("Signal confidence did not meet the required threshold")]
    ThresholdNotMet,
    #[msg("Escrow is not in the correct state for this operation")]
    InvalidEscrowStatus,
}
