import { Connection, PublicKey, Keypair, TransactionInstruction, Transaction, SystemProgram } from '@solana/web3.js';
import fs from 'fs';
import os from 'os';

async function initialize(rpc_url, program_id) {
  const connection = new Connection(rpc_url);
  const programId = new PublicKey(program_id);

  // Load your wallet keypair
  const payer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/id.json')))
  );

  // Derive state PDA
  const [stateAccount] = PublicKey.findProgramAddressSync([Buffer.from('state')], programId);

  // Build instruction data: [0] + 8 bytes for initial_threshold
  const data = Buffer.alloc(9);
  data[0] = 0; // initialize discriminator
  data.writeBigUint64LE(BigInt(1000000), 1); // initial threshold

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: stateAccount, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [payer]);
  console.log('Initialize transaction:', signature);
  console.log('State account PDA:', stateAccount.toString());
}

const args = process.argv.slice(2); // Skip 'node' and script name
const rpcUrl = args[0];
const program_id = args[1];
initialize(rpcUrl, program_id).catch(console.error);
