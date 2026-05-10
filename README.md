# Opaque Escrow — Agent-to-Agent Blind Verification Protocol

> Built for the MagicBlock Bounty on Superteam | Solana Devnet

---

## The Problem

In 2026, AI agents are buying services from other agents. A **Trading Agent** wants to buy a proprietary alpha signal from an **Analytics Agent**. But there's a deadlock:

- **Buyer Agent** won't pay until it knows the data is valid
- **Seller Agent** won't reveal the data until it gets paid
- **Public blockchains** can't solve this — verifying data on-chain reveals the data itself

This is the **Intellectual Property Paradox** of agent-to-agent commerce.

---

## The Solution

**Opaque Escrow** is a "Black Box" escrow system where:

- Verification logic runs **inside** a MagicBlock Private Ephemeral Rollup (PER) with Intel TDX TEE
- The Seller's secret data enters the TEE and **never touches the public chain**
- The on-chain program enforces: `if signal.confidence >= threshold → release payment`
- The Buyer gets a **Verification Success** signal — never sees the raw data
- Payment settles on **Solana mainnet** — trustless and guaranteed

To the agents, it feels like a native API call. To the blockchain, it's a clean settlement transaction with zero data leaked.

---

## Architecture
Buyer Agent                    Seller Agent
│                               │
│ create_escrow()               │
│ locks 0.1 SOL in vault        │
▼                               │
EscrowState PDA (Solana L1)        │
│                               │
│         ┌─────────────────────┘
│         │ submit signal (private)
│         ▼
│   MagicBlock PER / TEE
│   ┌─────────────────────┐
│   │  Verify(confidence  │
│   │  >= threshold)      │
│   │  PRIVATE EXECUTION  │
│   └─────────┬───────────┘
│             │ result only
▼             ▼
verify_and_settle() on Solana L1
SOL → Seller | Nothing leaked

---

## Why MagicBlock PER is the Key Ingredient

Standard Solana programs execute in public — every input, every computation, every state change is visible on the explorer. This makes blind verification impossible natively.

MagicBlock's Private Ephemeral Rollup solves this by:

1. **Delegating accounts** to a private session — state leaves the public chain temporarily
2. **TEE execution** (Intel TDX) — the verification logic runs in a hardware-secured enclave that nobody, not even MagicBlock's operator, can read
3. **Committing results back** to Solana L1 — only the outcome (True/False) is public, never the input data

This is **Blind Verification** — something impossible on standard Solana.

---

## Demo

Two agents. One secret. Zero leaks.

**Scenario:**
- Seller has a trading signal with 85% confidence
- Buyer will pay 0.1 SOL only if confidence ≥ 75%
- Neither party trusts the other
- The blockchain guarantees the outcome

**Run it:**

```bash
# Terminal 1 — Buyer Agent locks funds
node app/agents/buyer-agent.js <SELLER_PUBKEY> 0.1 75

# Terminal 2 — Seller Agent delivers signal
SELLER_KEYPAIR=~/seller-keypair.json node app/agents/seller-agent.js 85

# Result: Payment released. Check Solana Explorer — no confidence value visible.
```

**What you see on Solana Explorer:**
- ✅ SOL transferred from vault to seller
- ✅ EscrowState account updated
- ❌ No signal confidence value anywhere on-chain

That's Opaque Escrow.

---

## Setup

**Prerequisites:**
- Node.js v18+
- Rust + Anchor CLI 0.32+
- Solana CLI 2.0+

**Install:**
```bash
git clone https://github.com/hifey62/opaque-escrow
cd opaque-escrow
yarn install
cd app && npm install
```

**Deploy:**
```bash
anchor build
anchor deploy
```

**Generate seller wallet:**
```bash
solana-keygen new --outfile ~/seller-keypair.json --no-bip39-passphrase
solana airdrop 1 <SELLER_PUBKEY>
```

---

## Program Details

- **Program ID:** `Grmkz4pZa8Rc6SDzMtTsd6qR1nP6EKztwTw9rFaKBrUq`
- **Network:** Solana Devnet
- **Framework:** Anchor 0.32.1

**Instructions:**
- `create_escrow(amount, threshold)` — Buyer locks funds, sets confidence threshold
- `verify_and_settle(signal_confidence)` — Judge logic, releases payment if threshold met
- `cancel_escrow()` — Buyer reclaims funds if seller ghosts

**Accounts:**
- `EscrowState` PDA — stores buyer, seller, amount, threshold, status
- Vault PDA — holds locked SOL during escrow period

---

## Use Cases

- AI agent paying for proprietary alpha data
- Agent buying a trained model weight — pays only if accuracy meets spec
- DAO treasury buying research — pays only if deliverable meets criteria
- Any machine-to-machine transaction where data quality must be verified privately

---

## What Makes This Different

| Protocol | Chain | Privacy Method | Trustless |
|---|---|---|---|
| OpenSea/Magic Eden | Solana | Database (centralized) | ❌ |
| Zama Protocol | Ethereum | FHE (heavy) | ✅ |
| Oasis Sapphire | Oasis | Confidential chain | ✅ |
| **Opaque Escrow** | **Solana** | **MagicBlock PER + TDX** | ✅ |

First blind verification escrow protocol native to Solana.

---

## Built By

Ifeoluwa Lapite — [@hifey62](https://github.com/hifey62)

*MagicBlock Bounty Submission — Superteam 2026*
