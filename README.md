# Conclave — Anonymous DAO Workspace

**Where your vote speaks louder than your identity.**

Private voting. Encrypted chat. Zero surveillance. Built on Solana with optional [Realms](https://realms.today) integration.

---

## What is Conclave?

Conclave is a **governance and collaboration app** for token-holder communities (DAOs). Members join **rooms** gated by a governance token, then:

- **Chat** in end-to-end encrypted group messages
- **Create and vote** on proposals (simple yes/no or quadratic voting)
- **Fund and manage** a room **treasury** (SOL)
- **Execute** approved proposals that transfer SOL from the treasury
- Optionally **link to a Realms realm** and surface realm proposals in the room

Voting is **commit–reveal**: you submit a commitment first, then reveal your choice after the deadline, so votes stay private until tallying.

---

## Features & Functionality

### Rooms

- **Create a room** — Name + governance token mint (any SPL token). Only holders of that token can join.
- **Join a room** — Prove token ownership; receive the room’s encrypted group key (from the indexer or, for the creator, from the browser).
- **Room authority** — The creator can initialize the treasury, and (if indexer was down at create time) publish the room key so others can join.

### Encrypted Chat

- **Group key** — Generated when the room is created; stored in the creator’s browser and sent to the indexer so new members can join.
- **Messages** — Encrypted (e.g. NaCl secretbox) and stored on chain; decrypted in the app using the group key.
- **Session keys (gasless)** — Optional: create a session key so a relayer or another device can send messages without the main wallet signing every time.

### Proposals & Voting

- **Create proposal** — Title, description, deadline, and **vote mode**:
  - **Simple** (0): one vote per member (yes/no).
  - **Quadratic** (1): credits are spread across options; total credits configurable per proposal.
- **Cast vote** — Submit a **commitment** (hash of your choice + nonce) so your vote is hidden until reveal.
- **Reveal vote** — After the deadline, reveal your choice and nonce; the program checks the hash and tallies.
- **Finalize** — Room authority finalizes the proposal so results are fixed and (if applicable) execution can happen.

### Treasury

- **Initialize treasury** — Room authority creates the treasury PDA for the room (once).
- **Fund treasury** — Anyone can send SOL to the room treasury.
- **Execute proposal action** — After a proposal is finalized and approved, the authority can execute a transfer of SOL from the treasury (e.g. to a grant recipient).

### Realms Integration

- **Link room to a realm** — Optional: associate a room with a [Realms](https://realms.today) realm (by realm address).
- **Realm proposals** — View and link to realm proposals from inside the room; verify membership via Realms TokenOwnerRecord.

### ZK Proof of Membership

- **Prove “I hold the governance token” without revealing which wallet** — Room members can register an anonymous Semaphore identity (commitment) and generate a **Groth16 ZK proof** that their commitment is a leaf in the room’s Poseidon Merkle tree. Verifiers get a cryptographic guarantee that the prover is in the token-gated group, with no link to wallet or leaf index. Verification is real (Semaphore + PSE trusted setup); the app supports “Copy proof” and “Verify a proof” so anyone can check validity. This is a core fit for Conclave’s anonymous privacy governance: eligibility is proven, identity stays private. See **conclave/ZK_MEMBERSHIP.md** for the full flow and why it’s relevant to the use case.

### Indexer (backend)

- **REST API** — Rooms, members, messages, proposals, vote commitments, group keys (for join flow).
- **Sync from chain** — Polls the Conclave program and fills SQLite in FK-safe order; supports single-room fetch so the group key can be stored right after create.
- **Run locally** — `cd conclave/indexer && npm run dev` (default port 3001). The app needs it for room list, messages, and join (room key).

### Developer tooling & extras

- **PWA (installable app)** — Add to Home Screen on mobile or desktop for an app-like experience. Manifest and theme are included.
- **`conclave-sdk` (NPM package)** — Dev toolkit in `conclave/packages/conclave-sdk`: indexer API client, PDAs (room, member, proposal, treasury, etc.), and TypeScript types. Use it to build bots, dashboards, or Realms extensions that read Conclave data. See `conclave/packages/conclave-sdk/README.md`.

---

## Hackathon — Realms DAO track

**Conclave** is built for the **Solana Graveyard Hackathon — Realms** track. We target **Governance Builders** (tooling and governance systems on Realms) and **Realms Extensions** (integrations that expand Realms orgs).

Conclave extends Realms with **private voting** (commit–reveal and quadratic), **encrypted discussion**, and optional **ZK proof of membership**. Rooms can be linked to a Realms realm and surface its proposals in-app; membership is verified via Realms TokenOwnerRecord.

**Quick run for judges (devnet):**

1. **Run indexer + app** — Terminal 1: `cd conclave && npm run dev`. Terminal 2: `cd conclave/indexer && npm run dev`.
2. **Connect wallet** — Open [http://localhost:3000](http://localhost:3000), connect a devnet wallet (e.g. Phantom).
3. **Create a room** — “Create Room” → choose “Realms DAO”, then either link an existing realm address or “Create new Realm” to deploy a DAO and use its community mint.
4. **Join, propose, vote** — Join the room (prove token ownership), open “Proposals” → “Create proposal”, cast a commit vote, and after the deadline reveal and finalize.
5. **Treasury** — Room authority: “Treasury” tab → init treasury, fund with SOL, and after a proposal passes, execute a transfer.

---

## Tech Stack

| Layer        | Tech |
|-------------|------|
| Chain       | Solana (Anchor program) |
| Frontend    | Next.js, React, Tailwind, Solana wallet-adapter |
| Crypto      | TweetNaCl (encryption, key derivation) |
| Backend     | Node.js indexer (Express, better-sqlite3), optional Realms SDK |

---

## Project Structure

```
Conclave/
├── README.md                 # This file
└── conclave/
    ├── packages/conclave-sdk # NPM package: API client, PDAs, types (dev tooling)
    ├── programs/conclave/    # Anchor program (Rust)
    │   └── src/
    │       ├── lib.rs
    │       ├── instructions/ # create_room, join_room, create_proposal, cast_vote, reveal_vote, reveal_quadratic_vote, send_message, finalize_proposal, init_treasury, fund_treasury, execute_proposal_action, create_session, send_message_with_session, ...
    │       ├── state/
    │       ├── errors.rs
    │       └── events.rs
    ├── app/sdk/              # Crypto, Realms helpers
    ├── components/           # ChatRoom, MemberList, TreasuryCard, RealmsGovernance, ...
    ├── hooks/                # useConclaveProgram, useSessionKey
    ├── lib/                  # API client, conclave PDAs, IDL
    ├── pages/                # Next.js pages (home, rooms list, create room, room detail [chat | proposals | members | treasury | realms])
    ├── indexer/              # Node indexer + REST API
    ├── public/manifest.json   # PWA manifest (installable app)
    ├── target/idl/           # Generated IDL (anchor build)
    └── FLOW.md               # Detailed flow: create room, join, key publish, messages
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (for deploy)
- [Anchor](https://www.anchor-lang.com/docs/installation) (for build/deploy)

### 1. Install dependencies

```bash
cd conclave
npm install
cd indexer && npm install && cd ..
```

### 2. Build the program

```bash
anchor build
```

Copy the IDL into the frontend so the app sees all instructions (e.g. `init_treasury`, `fund_treasury`):

```bash
cp target/idl/conclave.json lib/idl/conclave.json
```

### 3. Configure cluster

Set your Solana CLI to devnet (or mainnet) and ensure your wallet has SOL:

```bash
solana config set --url devnet
solana airdrop 2
```

### 4. Deploy the program (optional; for a live app)

```bash
anchor deploy --provider.cluster devnet
```

(Program ID is in `programs/conclave/src/lib.rs` and in the IDL; keep them in sync.)

### 5. Run the app and indexer

**Terminal 1 — Next.js:**

```bash
cd conclave
npm run dev
```

**Terminal 2 — Indexer (required for room list, messages, join):**

```bash
cd conclave/indexer
npm run dev
```

Or run both with:

```bash
cd conclave
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000), connect a wallet, create or browse rooms.

### 6. Create a room

- **Room name** — Any (max 50 chars).
- **Governance token mint** — SPL token mint address. Only wallets that hold ≥1 of this token can join. You can:
  - Use a Realms DAO’s community mint,
  - Use an existing SPL token, or
  - Create a test token (e.g. `spl-token create-token`, then create account and mint).

After create, the app auto-publishes the room key to the indexer (if it’s running) and auto-joins you.

---

## Environment

- **Frontend** — `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`) for the indexer base URL.
- **Indexer** — `RPC_URL`, `WS_URL`, `PORT`, `DB_PATH` (default `conclave.db`).

---

## Flow Summary

| Action              | Description |
|---------------------|-------------|
| Create room         | On-chain room + group key generated; key stored in browser and sent to indexer. |
| Join room           | App gets key from indexer (or creator’s localStorage); `join_room` on chain. |
| Send message        | Encrypted with group key; stored on chain; indexer serves to chat UI. |
| Create proposal     | Title, description, deadline, vote mode (simple/quadratic), credits. |
| Cast / reveal vote  | Commit then reveal; proposal finalized by authority. |
| Init treasury       | Room authority once per room. |
| Fund treasury       | Send SOL to room treasury. |
| Execute proposal    | Authority executes approved proposal (e.g. transfer SOL from treasury). |

See **conclave/FLOW.md** for detailed create/join/key-publish and message flow.

---

## License

ISC.
