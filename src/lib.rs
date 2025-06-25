use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::{find_program_address, Pubkey},
    seeds,
    sysvars::rent::{
        Rent, DEFAULT_BURN_PERCENT, DEFAULT_EXEMPTION_THRESHOLD, DEFAULT_LAMPORTS_PER_BYTE_YEAR,
    },
    ProgramResult,
};
use pinocchio_system::instructions::CreateAccount;
use pinocchio_token::instructions::Burn;

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    match instruction_data[0] {
        0 => initialize(program_id, accounts, &instruction_data[1..]),
        1 => swallow(program_id, accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

#[inline(always)]
fn initialize(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [state_account, payer, _system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Verify state PDA
    let (state_pda, bump) = find_program_address(&[b"state"], program_id);

    if state_account.key() != &state_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    // Parse initial threshold
    let initial_threshold = u64::from_le_bytes(data[0..8].try_into().unwrap());

    // Create state account
    let rent = Rent {
        lamports_per_byte_year: DEFAULT_LAMPORTS_PER_BYTE_YEAR,
        exemption_threshold: DEFAULT_EXEMPTION_THRESHOLD,
        burn_percent: DEFAULT_BURN_PERCENT,
    };
    let space = 16; // 8 + 8 bytes for prev/next
    let lamports = rent.minimum_balance(space);

    let create_account = CreateAccount {
        from: payer,
        to: state_account,
        lamports,
        space: space as u64,
        owner: program_id,
    };

    let pda_ref = &[bump];
    let seeds = seeds!(b"state", pda_ref);
    let signer = Signer::from(&seeds);
    create_account.invoke_signed(&[signer])?;

    // Initialize state
    let mut state_data = state_account.try_borrow_mut_data()?;
    state_data[0..8].copy_from_slice(&initial_threshold.to_le_bytes());
    state_data[8..16].copy_from_slice(&initial_threshold.to_le_bytes());

    Ok(())
}

#[inline(always)]
fn swallow(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let [state_account, program_authority, program_token_account, token_mint, _token_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Verify accounts
    let (state_pda, _) = find_program_address(&[b"state"], program_id);
    let (auth_pda, auth_bump) = find_program_address(&[b"program_authority"], program_id);

    if state_account.key() != &state_pda || program_authority.key() != &auth_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    // Read state
    let state_data = state_account.try_borrow_data()?;
    let prev = u64::from_le_bytes(state_data[0..8].try_into().unwrap());
    let next = u64::from_le_bytes(state_data[8..16].try_into().unwrap());
    drop(state_data);

    // Check balance
    let token_account_data = program_token_account.try_borrow_data()?;
    let current_balance = u64::from_le_bytes(token_account_data[64..72].try_into().unwrap());
    drop(token_account_data);

    if current_balance < next {
        return Err(ProgramError::InsufficientFunds);
    }

    let burn = Burn {
        account: program_token_account,
        mint: token_mint,
        authority: program_authority,
        amount: next,
    };
    let pda_ref = &[auth_bump];
    let seeds = seeds!(b"program_authority", pda_ref);
    let signer = Signer::from(&seeds);
    burn.invoke_signed(&[signer])?;

    // Update state (Fibonacci)
    let new_next = prev.checked_add(next).unwrap();
    let mut state_data = state_account.try_borrow_mut_data()?;
    state_data[0..8].copy_from_slice(&next.to_le_bytes());
    state_data[8..16].copy_from_slice(&new_next.to_le_bytes());

    Ok(())
}
