
import { start } from "solana-bankrun";import { PublicKey, Keypair, TransactionInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  createTransferInstruction, 
  createInitializeMintInstruction, 
  createInitializeAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import fs from "fs";
import { Buffer } from "buffer";

describe('Semen Mafia', () => {
  let context: any;
  const programId = new PublicKey("topG3JDRBZeSyUxvicdez4FSCooX8oJVfvC32VLshwf");
  let payer: Keypair;

  before(async () => {
    const programBinary = fs.readFileSync("target/deploy/semen_mafia.so");
    context = await start([], []);
    payer = context.payer;
    await context.setAccount(programId, {
      lamports: 1000000000,
      data: programBinary,
      owner: new PublicKey("BPFLoader2111111111111111111111111111111111"),
      executable: true,
    });
  });

  it("should initialize", async () => {
    const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("state")], programId);
    
    const initData = Buffer.alloc(9);
    initData[0] = 0;
    initData.writeBigUint64LE(BigInt(1000000), 1);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: globalState, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: initData,
    });

    const tx = new Transaction().add(ix);
    tx.recentBlockhash = context.lastBlockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);
    
    await context.banksClient.processTransaction(tx);
  });

  it("should swallow (burn) tokens", async () => {
    // Derive PDAs
    const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("state")], programId);
    const [programAuthority] = PublicKey.findProgramAddressSync([Buffer.from("program_authority")], programId);
    const mint = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync('smnke8ZE6nqhdHNGNibJVmJ4GcnNTJAw5r6qXfhesbp.json', 'utf8')))
    );
    
    // 1. Create and initialize mint
    const mintRent = 1461600; // minimum rent for mint account
    const createMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: 82,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(mint.publicKey, 0, payer.publicKey, null),
    );
    createMintTx.recentBlockhash = context.lastBlockhash;
    createMintTx.feePayer = payer.publicKey;
    createMintTx.sign(payer, mint);
    await context.banksClient.processTransaction(createMintTx);

    console.log("Mint created");

    // 2. Create PAYER's token account
    const payerTokenAccount = Keypair.generate();
    const tokenAccountRent = 2039280; // minimum rent for token account
    
    const createPayerTokenAccountTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: payerTokenAccount.publicKey,
        space: 165,
        lamports: tokenAccountRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccountInstruction(payerTokenAccount.publicKey, mint.publicKey, payer.publicKey),
    );
    createPayerTokenAccountTx.recentBlockhash = context.lastBlockhash;
    createPayerTokenAccountTx.feePayer = payer.publicKey;
    createPayerTokenAccountTx.sign(payer, payerTokenAccount);
    await context.banksClient.processTransaction(createPayerTokenAccountTx);
    console.log("Payer token account created");

    // 3. Create PROGRAM's token account
    const programTokenAccount = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync('mafiabMzySH6Ep6dXVqamaV8YHnWGtfRd1Zok75gHJs.json', 'utf8')))
    );
    const createProgramTokenAccountTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: programTokenAccount.publicKey,
        space: 165,
        lamports: tokenAccountRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccountInstruction(programTokenAccount.publicKey, mint.publicKey, programAuthority),
    );
    createProgramTokenAccountTx.recentBlockhash = context.lastBlockhash;
    createProgramTokenAccountTx.feePayer = payer.publicKey;
    createProgramTokenAccountTx.sign(payer, programTokenAccount);
    await context.banksClient.processTransaction(createProgramTokenAccountTx);
    console.log("Program token account created");

    // 4. Mint tokens to PAYER
    const mintToTx = new Transaction().add(
      createMintToInstruction(mint.publicKey, payerTokenAccount.publicKey, payer.publicKey, 2_000_000)
    );
    mintToTx.recentBlockhash = context.lastBlockhash;
    mintToTx.feePayer = payer.publicKey;
    mintToTx.sign(payer);
    await context.banksClient.processTransaction(mintToTx);
    console.log("Tokens minted to payer");

    // 5. PAYER transfers tokens to PROGRAM
    const transferTx = new Transaction().add(
      createTransferInstruction(
        payerTokenAccount.publicKey,
        programTokenAccount.publicKey,
        payer.publicKey,
        1_000_000,
      )
    );
    transferTx.recentBlockhash = context.lastBlockhash;
    transferTx.feePayer = payer.publicKey;
    transferTx.sign(payer);
    await context.banksClient.processTransaction(transferTx);
    console.log("Tokens transferred to program");

    // 6. NOW program can burn its tokens
    const swallowData = Buffer.alloc(1);
    swallowData[0] = 1; // swallow discriminator

    const swallowIx = new TransactionInstruction({
      keys: [
        { pubkey: globalState, isSigner: false, isWritable: true },
        { pubkey: programAuthority, isSigner: false, isWritable: false },
        { pubkey: programTokenAccount.publicKey, isSigner: false, isWritable: true },
        { pubkey: mint.publicKey, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: swallowData,
    });

    const swallowTx = new Transaction().add(swallowIx);
    swallowTx.recentBlockhash = context.lastBlockhash;
    swallowTx.feePayer = payer.publicKey;
    swallowTx.sign(payer);
    
    await context.banksClient.processTransaction(swallowTx);
    console.log("🔥 Swallow test passed!");
  });
});