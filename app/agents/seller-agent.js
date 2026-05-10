const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");
require("dotenv").config();

// ── CONFIG ──────────────────────────────────────────
const PROGRAM_ID = new PublicKey("Grmkz4pZa8Rc6SDzMtTsd6qR1nP6EKztwTw9rFaKBrUq");
const CONNECTION = new Connection("https://api.devnet.solana.com", "confirmed");

// Load seller wallet
const sellerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(process.env.SELLER_KEYPAIR || "/home/hifey/.config/solana/id.json")))
);

async function deliverSignal(signalConfidence) {
    console.log("\n🤖 SELLER AGENT — Delivering Signal");
    console.log(`   Signal confidence: ${signalConfidence}%`);
    console.log(`   (This value stays PRIVATE — never leaked on-chain)\n`);

    // Load escrow state written by buyer agent
    if (!fs.existsSync("escrow-state.json")) {
        console.error("No escrow-state.json found. Run buyer-agent first.");
        process.exit(1);
    }

    const escrowState = JSON.parse(fs.readFileSync("escrow-state.json"));
    console.log(`   Escrow PDA: ${escrowState.escrowPDA}`);
    console.log(`   Threshold:  ${escrowState.threshold}% required`);

    // Simulate the private verification (in production this runs inside MagicBlock PER/TEE)
    console.log(`\n🔒 [PER/TEE] Running blind verification...`);
    console.log(`   Checking: ${signalConfidence} >= ${escrowState.threshold}`);

    if (signalConfidence < escrowState.threshold) {
        console.log(`\n❌ Signal did not meet threshold. Payment will NOT be released.`);
        console.log(`   Buyer can cancel and reclaim funds.`);
        return;
    }

    console.log(`   ✅ Verification passed inside TEE. Triggering settlement...\n`);

    // Load IDL
    const idl = JSON.parse(fs.readFileSync("../target/idl/opaque_escrow.json"));
    const provider = new anchor.AnchorProvider(
        CONNECTION,
        new anchor.Wallet(sellerKeypair),
        { commitment: "confirmed" }
    );
    const program = new anchor.Program(idl, provider);

    const escrowPDA = new PublicKey(escrowState.escrowPDA);
    const vaultPDA = new PublicKey(escrowState.vaultPDA);
    const buyer = new PublicKey(escrowState.buyer);

    // Call verify_and_settle — this is what settles on Solana L1
    const tx = await program.methods
        .verifyAndSettle(signalConfidence)
        .accounts({
            escrowState: escrowPDA,
            vault: vaultPDA,
            seller: sellerKeypair.publicKey,
            buyer: buyer,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([sellerKeypair])
        .rpc();

    console.log(`✅ Payment released to seller!`);
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log(`\n🔍 Check Solana Explorer — you will see the settlement TX`);
    console.log(`   but NO confidence value is visible on-chain. That's Opaque Escrow.`);
}

// Run
const confidence = parseInt(process.argv[2]) || 85;
deliverSignal(confidence).catch(console.error);

