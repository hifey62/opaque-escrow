const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");
require("dotenv").config();

// ── CONFIG ──────────────────────────────────────────
const PROGRAM_ID = new PublicKey("Grmkz4pZa8Rc6SDzMtTsd6qR1nP6EKztwTw9rFaKBrUq");
const CONNECTION = new Connection("https://api.devnet.solana.com", "confirmed");

// Load buyer wallet
const buyerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(process.env.BUYER_KEYPAIR || "/home/hifey/.config/solana/id.json")))
);

async function createEscrow(sellerPubkey, amountSol, threshold) {
    console.log("\n🤖 BUYER AGENT — Creating Escrow");
    console.log(`   Seller:    ${sellerPubkey}`);
    console.log(`   Amount:    ${amountSol} SOL`);
    console.log(`   Threshold: ${threshold}% confidence required\n`);

    const seller = new PublicKey(sellerPubkey);
    const amount = new anchor.BN(amountSol * LAMPORTS_PER_SOL);

    // Load IDL
    const idl = JSON.parse(fs.readFileSync("../target/idl/opaque_escrow.json"));
    const provider = new anchor.AnchorProvider(
        CONNECTION,
        new anchor.Wallet(buyerKeypair),
        { commitment: "confirmed" }
    );
    const program = new anchor.Program(idl, provider);

    // Derive PDAs
    const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), buyerKeypair.publicKey.toBuffer(), seller.toBuffer()],
        PROGRAM_ID
    );
    const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), escrowPDA.toBuffer()],
        PROGRAM_ID
    );

    console.log(`   Escrow PDA: ${escrowPDA.toString()}`);
    console.log(`   Vault PDA:  ${vaultPDA.toString()}`);

    // Send transaction
    const tx = await program.methods
        .createEscrow(amount, threshold)
        .accounts({
            escrowState: escrowPDA,
            vault: vaultPDA,
            buyer: buyerKeypair.publicKey,
            seller: seller,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([buyerKeypair])
        .rpc();

    console.log(`\n✅ Escrow created!`);
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log(`\n📦 Escrow details saved. Waiting for seller to deliver signal...`);

    // Save escrow details for seller agent to pick up
    fs.writeFileSync("escrow-state.json", JSON.stringify({
        escrowPDA: escrowPDA.toString(),
        vaultPDA: vaultPDA.toString(),
        buyer: buyerKeypair.publicKey.toString(),
        seller: sellerPubkey,
        amount: amountSol,
        threshold,
        tx
    }, null, 2));

    return escrowPDA.toString();
}

// Run
const sellerAddress = process.argv[2];
const amount = parseFloat(process.argv[3]) || 0.1;
const threshold = parseInt(process.argv[4]) || 75;

if (!sellerAddress) {
    console.error("Usage: node buyer-agent.js <seller-pubkey> <amount-sol> <threshold>");
    process.exit(1);
}

createEscrow(sellerAddress, amount, threshold).catch(console.error);
