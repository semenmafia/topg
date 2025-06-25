import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createInitializeAccountInstruction } from '@solana/spl-token';
import fs from 'fs';
import os from 'os';

async function createProgramTokenAccount(rpc_url, mint, owner, ta_keypair) {
  const connection = new Connection(rpc_url);
  const programId = new PublicKey(owner);
  const semenMint = new PublicKey(mint);

  // Load your wallet keypair (pays for account creation)
  const payer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/id.json')))
  );

  // Derive program authority PDA
  const [programAuthority] = PublicKey.findProgramAddressSync([Buffer.from('program_authority')], programId);

  // Create new token account keypair
  const tokenAccount = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(ta_keypair)))
  );

  // Get rent for token account
  const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165);

  console.log('Creating program token account...');
  console.log('Program Authority PDA:', programAuthority.toString());
  console.log('Token Account:', tokenAccount.publicKey.toString());
  console.log('SEMEN Mint:', semenMint.toString());

  const tx = new Transaction().add(
    // Create the account
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: tokenAccount.publicKey,
      space: 165, // Token account size
      lamports: tokenAccountRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    // Initialize it as a token account owned by program authority
    createInitializeAccountInstruction(
      tokenAccount.publicKey,
      semenMint,
      programAuthority // Owner is the program authority PDA
    )
  );

  const signature = await connection.sendTransaction(tx, [payer, tokenAccount]);
  console.log('Transaction signature:', signature);
  console.log('✅ Program token account created!');
}

const args = process.argv.slice(2); // Skip 'node' and script name
const rpcUrl = args[0];
const mint = args[1];
const owner = args[2];
const to_keypair = args[3];
createProgramTokenAccount(rpcUrl, mint, owner, to_keypair).catch(console.error); 
