# Conclave — The Privacy Layer for Solana DAOs

> **Every DAO tool today has one critical flaw: your vote is public before it closes.**
> Conclave fixes this — commit–reveal voting, end-to-end encrypted chat, quadratic governance,
> and ZK proof of membership. Drop-in privacy for any Realms DAO.

[![Solana](https://img.shields.io/badge/Solana-Devnet%20%2F%20Mainnet--ready-9945FF?logo=solana)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.32.1-blue)](https://www.anchor-lang.com)
[![License](https://img.shields.io/badge/license-ISC-green)](LICENSE)
[![npm](https://img.shields.io/badge/npm-conclave--sdk-CB3837?logo=npm)](https://www.npmjs.com/package/conclave-sdk)

**Live app:** [https://conclave-dao.xyz/](https://conclave-dao.xyz/) · **Demo video:** [https://youtu.be/uxaPb4vJ9lY](https://youtu.be/uxaPb4vJ9lY)

---

## The Problem

| DAO Tool | What breaks |
|---|---|
| Realms | Votes public while open → whale-watching, last-second flips, voter suppression |
| Snapshot | Off-chain, not enforceable, no chat privacy |
| Tally | Fully transparent, no privacy primitive |
| Discord/Telegram | Zero on-chain accountability, no privacy |

**Real consequences:**
- Members see a whale voting Yes → they pile in (herding)
- Founders can identify who voted against them
- Sensitive budget discussions happen in DMs because on-chain chat is public
- Small holders don't vote because their wallet reveals their identity

---

## The Solution

```
Realms DAO  +  Conclave  =  Private Governance
```

Conclave is a **privacy coordination layer** that sits on top of any token-gated community.
It does not replace Realms — it adds what Realms can't: **private deliberation and secret ballots**.

---

## Architecture

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         CONCLAVE — SYSTEM ARCHITECTURE                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                          CLIENT (Browser / PWA)                          │
  │                                                                          │
  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
  │   │  Chat    │  │ Proposals│  │  Members │  │ Treasury │  │ Realms  │  │
  │   │  Room    │  │  & Vote  │  │  + ZK    │  │  Mgmt    │  │  Link   │  │
  │   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘  │
  │        │              │              │              │              │       │
  │   ┌────▼──────────────▼──────────────▼──────────────▼──────────────▼───┐ │
  │   │                   PRIVACY LAYER (browser-side, no server touch)     │ │
  │   │                                                                     │ │
  │   │  ┌─────────────────────┐    ┌─────────────────────────────────────┐ │ │
  │   │  │   ENCRYPTION        │    │   VOTING COMMITMENT                 │ │ │
  │   │  │                     │    │                                     │ │ │
  │   │  │  TweetNaCl (NaCl)   │    │  Standard:                         │ │ │
  │   │  │  X25519 key deriv.  │    │    commitment = sha256(choice‖nonce) │ │ │
  │   │  │  secretbox (XSalsa) │    │                                     │ │ │
  │   │  │  Group key per room │    │  Quadratic:                        │ │ │
  │   │  │  Enc per member     │    │    commitment =                     │ │ │
  │   │  │  (box/unbox)        │    │    sha256(count_le4‖choice‖nonce)   │ │ │
  │   │  └─────────────────────┘    └─────────────────────────────────────┘ │ │
  │   │                                                                     │ │
  │   │  ┌─────────────────────┐    ┌─────────────────────────────────────┐ │ │
  │   │  │   ZK MEMBERSHIP     │    │   SESSION KEYS (Gasless)            │ │ │
  │   │  │                     │    │                                     │ │ │
  │   │  │  Semaphore identity │    │  Ephemeral keypair (no wallet)      │ │ │
  │   │  │  Poseidon Merkle    │    │  session_key signs messages         │ │ │
  │   │  │  Groth16 proof      │    │  Expires at timestamp               │ │ │
  │   │  │  Prove membership   │    │  Relayer broadcasts                 │ │ │
  │   │  │  without wallet     │    │  (unlinks wallet from message)      │ │ │
  │   │  └─────────────────────┘    └─────────────────────────────────────┘ │ │
  │   └─────────────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────┬──────────────────────────────────────────┘
                                 │  signed transactions
                                 ▼
  ╔══════════════════════════════════════════════════════════════════════════╗
  ║                    CONCLAVE ANCHOR PROGRAM (Solana)                      ║
  ║                    Program ID: E5HrS48LBddCwXGdq4ULPB8bC8rihUReDmu9eRiPQieU ║
  ╠══════════════════════════════════════════════════════════════════════════╣
  ║                                                                          ║
  ║  ACCOUNTS (PDAs)                         INSTRUCTIONS (16)              ║
  ║  ───────────────────────────────         ─────────────────────────────  ║
  ║  DaoRoom   ["room", auth, name]          create_room                    ║
  ║    ├── authority: Pubkey                 join_room                      ║
  ║    ├── governance_mint: Pubkey           ─────────────────────────────  ║
  ║    ├── name: String                      create_proposal                ║
  ║    └── member_count / proposal_count     cast_vote                      ║
  ║                                          reveal_vote                    ║
  ║  Member    ["member", room, wallet]      reveal_quadratic_vote          ║
  ║    ├── wallet: Pubkey                    finalize_proposal              ║
  ║    └── encrypted_group_key: [u8]         ─────────────────────────────  ║
  ║                                          send_message                   ║
  ║  Message   ["message", room, sender, ts] send_message_with_session      ║
  ║    └── ciphertext: Vec<u8>  (on-chain)   close_message                  ║
  ║                                          ─────────────────────────────  ║
  ║  Proposal  ["proposal", room, title]     init_treasury                  ║
  ║    ├── vote_mode: u8 (0=std, 1=quad)     fund_treasury                  ║
  ║    └── total_credits: u32                execute_proposal_action        ║
  ║                                          ─────────────────────────────  ║
  ║  VoteCommitment ["vote", prop, voter]    create_session                 ║
  ║    └── commitment: [u8; 32]              update_member_key              ║
  ║                                          close_vote                     ║
  ║  Session   ["session", room, owner]                                     ║
  ║  Treasury  ["treasury", room]            EVENTS (11 emitted)            ║
  ║                                          RoomCreated, MemberJoined      ║
  ║  ERRORS: 31 custom error codes           ProposalCreated, VoteCast      ║
  ║                                          VoteRevealed, MessageSent      ║
  ║                                          ProposalFinalized              ║
  ║                                          SessionCreated, TreasuryFunded ║
  ║                                          ProposalActionExecuted         ║
  ║                                          QuadraticVoteRevealed          ║
  ╚══════════════════════════════════════════════════════════════════════════╝
                 │ RPC (getProgramAccounts + logs)
                 ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                     INDEXER  (Node.js + Express + SQLite)                │
  │                     Deployed: Vercel (serverless + cron sync)            │
  │                                                                          │
  │  Tables: rooms · members · messages · proposals · vote_commitments       │
  │          events · group_keys · vote_data                                 │
  │                                                                          │
  │  REST API Endpoints:                                                     │
  │  GET  /rooms                      → all rooms                            │
  │  GET  /rooms/:address             → room detail                          │
  │  GET  /rooms/:address/messages    → paginated encrypted messages         │
  │  GET  /rooms/:address/proposals   → proposal list                        │
  │  GET  /rooms/:address/members     → member list                          │
  │  GET  /proposals/:address         → proposal detail                      │
  │  GET  /members/:wallet/rooms      → rooms wallet is member of            │
  │  GET  /reputation/:wallet         → anonymous rep (votes+props+msgs)     │
  │  GET  /reputation/batch?wallets=  → batch reputation                     │
  │  GET  /health                     → health check                         │
  └──────────────────────────────┬───────────────────────────────────────────┘
                                 │
                   ┌─────────────┴──────────────┐
                   │                            │
                   ▼                            ▼
  ┌─────────────────────────┐   ┌──────────────────────────────────────────┐
  │   REALMS INTEGRATION    │   │   SOLANA ACTIONS / BLINKS                │
  │                         │   │                                          │
  │  SPL Governance SDK     │   │  GET  /api/actions/vote/[proposalPda]    │
  │  Program ID (same on    │   │  POST /api/actions/vote/[proposalPda]    │
  │  devnet + mainnet):     │   │                                          │
  │  GovER5Lthms3bLBq...    │   │  Blink URL:                              │
  │                         │   │  dial.to/?action=solana-action:          │
  │  fetchRealmInfo()       │   │    <origin>/api/actions/vote/<id>        │
  │  verifyMembership()     │   │                                          │
  │  fetchRealmProposals()  │   │  Vote from: Twitter, Discord, Telegram,  │
  │  getGovernanceMint()    │   │  any Solana-aware app or bot             │
  │                         │   │                                          │
  │  TokenOwnerRecord       │   │  Server builds cast_vote tx with         │
  │  verification for       │   │  manual Anchor discriminator             │
  │  token-gated join       │   │  sha256("global:cast_vote")[0..8]        │
  └─────────────────────────┘   └──────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                     DEVELOPER SDK (NPM)                                  │
  │                     npm install conclave-sdk @solana/web3.js             │
  │                                                                          │
  │  packages/conclave-sdk/src/                                              │
  │  ├── client.ts    ConclaveClient — wraps all instructions                │
  │  ├── pdas.ts      getRoomPda, getMemberPda, getProposalPda, ...          │
  │  ├── types.ts     TypeScript types for all accounts                      │
  │  └── index.ts     re-exports                                             │
  │                                                                          │
  │  app/sdk/                                                                │
  │  ├── crypto.ts    TweetNaCl group key, message encrypt/decrypt           │
  │  ├── realms.ts    Realms SDK wrappers (fetchRealmInfo, etc.)             │
  │  └── tapestry.ts  Social graph integration                               │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## Why Conclave Wins Over Other DAO Tools

| Feature | Snapshot | Realms | Tally | **Conclave** |
|---|:---:|:---:|:---:|:---:|
| On-chain enforcement | ✗ | ✓ | ✓ | ✓ |
| Secret ballot (commit-reveal) | ✗ | ✗ | ✗ | ✓ |
| Quadratic voting | ✗ | ✗ | ✗ | ✓ |
| E2E encrypted group chat | ✗ | ✗ | ✗ | ✓ |
| ZK proof of membership | ✗ | ✗ | ✗ | ✓ |
| Gasless session keys | ✗ | ✗ | ✗ | ✓ |
| Anonymous reputation | ✗ | ✗ | ✗ | ✓ |
| Blinks (vote from anywhere) | ✗ | ✗ | ✗ | ✓ |
| Realms integration | ✗ | native | ✗ | ✓ |
| Open-source SDK on npm | ✗ | partial | ✗ | ✓ |
| Treasury + proposal execution | ✗ | ✓ | ✓ | ✓ |

---

## Features

### Rooms — Token-Gated Private Workspaces

- Create a room with any SPL governance token mint
- Only token holders can join (verified on-chain at `join_room`)
- Optionally link a room to an existing Realms realm
- Room authority manages treasury and proposal finalization
- **Encrypted group key** distributed per member — messages unreadable without membership

### Encrypted Chat

- Messages encrypted with **NaCl secretbox** (XSalsa20-Poly1305) before broadcast
- Ciphertext stored on-chain in `Message` accounts — raw chain data is opaque
- Group key encrypted separately for each member using **X25519 Diffie-Hellman** (derived from Solana Ed25519 keypair)
- **Session keys** for gasless messaging — ephemeral keypair, no wallet needed per message, relayer broadcasts

### Commit–Reveal Voting

```
Phase 1 (COMMIT):  commitment = sha256(choice ‖ nonce)  → stored on-chain
Phase 2 (REVEAL):  voter submits choice + nonce         → program verifies sha256
                   program tallies after deadline passes
```

- Nobody can see vote choices until all votes are revealed
- Prevents whale-watching, last-second flips, voter coercion
- Nonce stored locally — only you can reveal your vote

### Quadratic Voting

```
vote_weight = sqrt(credits_spent)
commitment  = sha256(vote_count_le_u32(4) ‖ vote_choice(1) ‖ nonce(32))
```

- Configurable voice credits per proposal
- Diminishing returns on concentrated power
- Same commit–reveal privacy guarantees apply

### Treasury

- Treasury PDA: `["treasury", room]` — holds SOL
- Fund by anyone; execute by authority after proposal passes + is finalized
- On-chain transfer enforcement — no multisig needed, proposal is the authority

### ZK Proof of Membership

- **Semaphore identity** — anonymous nullifier derived from wallet
- **Poseidon Merkle tree** — leaves are member identity commitments
- **Groth16 proof** — proves "I am in this tree" without revealing which leaf or wallet
- Verifiable by anyone; copy/paste proof in UI
- Prevents double-spending / Sybil in anonymous governance contexts

### Realms Integration

- Link room to any Realms realm address
- Verify membership via `TokenOwnerRecord` (no custom on-chain code needed)
- Surface realm proposals inside the Conclave room UI
- Use realm's community mint as room governance token
- Works with mainnet and devnet Realms (same SPL Governance program ID)

### Solana Actions / Blinks

- `GET /api/actions/vote/[proposalPda]` — returns action metadata
- `POST /api/actions/vote/[proposalPda]` — builds + returns `cast_vote` transaction
- Share vote link → members vote from Twitter, Discord, any Blink-aware client
- Nonce stored in indexer for later reveal

### Anonymous Reputation

- Off-chain, derived from indexer DB: `votes_cast + proposals_created + messages_sent`
- Tiers: **bronze** (1–4), **silver** (5–9), **gold** (10+)
- Wallet identity never revealed — reputation attached to room alias
- Displayed as colored badges in member list and chat

---

## Hackathon — Realms DAO Track

Built for the **Solana Graveyard Hackathon — Realms** track, targeting:
- **Governance Builders** — tooling and governance systems on Realms
- **Realms Extensions** — integrations that expand existing Realms orgs

**Try it:** [Live app](https://conclave-dao.xyz/) · [Demo video](https://youtu.be/uxaPb4vJ9lY)

**Conclave's value to the Realms ecosystem:**
1. Any existing Realms DAO can link a Conclave room in minutes
2. Adds private voting layer without migrating or replacing their Realms setup
3. Encrypted discussion space for the same token-holders
4. SDK lets Realms developers build bots and dashboards on Conclave data

**Quick run for judges (devnet, ~5 min):**

```bash
# Terminal 1
cd conclave && npm install && npm run dev

# Terminal 2
cd conclave/indexer && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000):

1. Connect a devnet wallet (Phantom)
2. Create a room — optionally paste a Realms realm address
3. Join with a second wallet (or use an existing governance token)
4. Open **Chat** tab → send a message (observe: raw ciphertext on-chain)
5. Open **Proposals** tab → create a quadratic proposal
6. Commit vote from wallet 1 and wallet 2
7. After deadline → Reveal votes → Finalize
8. Open **Treasury** tab → init, fund, execute (if proposal passed)
9. Open **Realms** tab → view linked realm proposals

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chain | Solana (Anchor 0.32.1, Rust 1.89) |
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Wallet | @solana/wallet-adapter (Phantom, Solflare) |
| Encryption | TweetNaCl (X25519, XSalsa20-Poly1305, SHA-256) |
| ZK | Semaphore v3 + Groth16 (PSE trusted setup) |
| Realms | @realms-today/spl-governance |
| Backend | Node.js, Express, better-sqlite3 |
| Indexer deploy | Vercel (serverless + cron) |
| SDK | tsup (CJS + ESM), published to npm |

---

## Project Structure

```
Conclave/
├── README.md
└── conclave/
    ├── programs/conclave/src/
    │   ├── lib.rs                          # 16 instructions declared
    │   ├── instructions/
    │   │   ├── create_room.rs
    │   │   ├── join_room.rs
    │   │   ├── create_proposal.rs
    │   │   ├── cast_vote.rs
    │   │   ├── reveal_vote.rs
    │   │   ├── reveal_quadratic_vote.rs
    │   │   ├── send_message.rs
    │   │   ├── send_message_with_session.rs
    │   │   ├── finalize_proposal.rs
    │   │   ├── close_message.rs
    │   │   ├── close_vote.rs
    │   │   ├── update_member_key.rs
    │   │   ├── create_session.rs
    │   │   ├── init_treasury.rs
    │   │   ├── fund_treasury.rs
    │   │   └── execute_proposal_action.rs
    │   ├── state/
    │   │   ├── dao_room.rs
    │   │   ├── member.rs
    │   │   ├── message.rs
    │   │   ├── proposal.rs       # vote_mode + total_credits
    │   │   ├── session.rs
    │   │   └── treasury.rs
    │   ├── errors.rs             # 31 custom errors
    │   └── events.rs             # 11 event types
    ├── pages/
    │   ├── index.tsx             # Landing
    │   ├── rooms/
    │   │   ├── index.tsx         # Room browser
    │   │   ├── create.tsx        # Create room + Realms link
    │   │   └── [roomPda].tsx     # Room detail (chat / proposals / members / treasury / realms)
    │   │       └── proposals/
    │   │           ├── create.tsx
    │   │           └── [proposalPda].tsx
    │   └── api/actions/vote/[proposalPda].ts   # Solana Blinks endpoint
    ├── components/
    │   ├── ChatRoom.tsx          # E2E encrypted chat UI
    │   ├── MemberList.tsx        # Member list + reputation badges
    │   ├── TreasuryCard.tsx      # Treasury init / fund / execute
    │   ├── RealmsGovernance.tsx  # Realms realm info + proposals
    │   └── ZKMembershipCard.tsx  # ZK proof generation + verification
    ├── lib/
    │   ├── conclave.ts           # PDA derivation + TypeScript interfaces
    │   ├── api.ts                # Indexer REST client
    │   └── anon.ts               # Semaphore identity + anonymous rep
    ├── app/sdk/
    │   ├── crypto.ts             # TweetNaCl group key, encrypt, vote commitments
    │   ├── realms.ts             # Realms SDK wrappers
    │   └── tapestry.ts           # Social graph integration
    ├── packages/conclave-sdk/    # NPM package: ConclaveClient, PDAs, types
    ├── indexer/                  # Node.js indexer + REST API + SQLite
    ├── public/manifest.json      # PWA manifest
    └── tests/                    # 25+ Anchor tests
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor 0.32.1](https://www.anchor-lang.com/docs/installation)

### Install and run

```bash
cd conclave
npm install
cd indexer && npm install && cd ..
npm run dev:all      # starts Next.js (3000) + indexer (3001)
```

### Build and deploy (devnet)

```bash
anchor build
cp target/idl/conclave.json lib/idl/conclave.json
solana config set --url devnet && solana airdrop 2
anchor deploy --provider.cluster devnet
```

### Create a test governance token

```bash
spl-token create-token
spl-token create-account <MINT>
spl-token mint <MINT> 100
```

---

## Mainnet Deployment

Conclave is mainnet-ready. Three environment changes:

**1. Deploy program**
```bash
solana config set --url mainnet-beta
anchor deploy --provider.cluster mainnet-beta
# note new program ID
```

**2. Frontend `.env`**
```
NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
NEXT_PUBLIC_PROGRAM_ID=<NEW_MAINNET_PROGRAM_ID>
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet
```

**3. Indexer `indexer/.env`**
```
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

> **Realms on mainnet:** No code changes needed. The SPL Governance program ID (`GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw`) is the same on mainnet and devnet. The `connection` follows your RPC automatically.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Indexer base URL |
| `NEXT_PUBLIC_RPC_URL` | Solana devnet | RPC endpoint |
| `NEXT_PUBLIC_PROGRAM_ID` | `E5HrS48...` | Conclave program ID |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet` | Used in Realms outbound links |
| `RPC_URL` (indexer) | devnet | Indexer RPC endpoint |
| `PORT` (indexer) | `3001` | Indexer port |
| `DB_PATH` (indexer) | `conclave.db` | SQLite path |

---

## Flow Summary

| Step | What happens |
|---|---|
| Create room | DaoRoom PDA created; group key generated in browser; key posted to indexer |
| Join room | App fetches group key from indexer; `join_room` verifies token ownership on-chain |
| Send message | Plaintext encrypted with group key → ciphertext stored in Message PDA |
| Decrypt messages | App fetches ciphertext from indexer; decrypts in browser with group key |
| Create proposal | Proposal PDA with vote_mode + total_credits; deadline timestamp |
| Cast vote | commitment = sha256(choice‖nonce) stored in VoteCommitment PDA |
| Reveal vote | Voter submits choice + nonce; program verifies hash; tallies votes |
| Finalize | Room authority finalizes; results locked |
| Treasury execute | Authority transfers SOL from Treasury PDA to recipient |
| Share Blink | `dial.to/?action=solana-action:<origin>/api/actions/vote/<id>` |

---

## Conclave SDK

**Package:** [conclave-sdk on npm](https://www.npmjs.com/package/conclave-sdk) — indexer API client, PDAs (room, member, proposal, treasury, etc.), and TypeScript types for building bots, dashboards, and Realms extensions.

| | |
|---|---|
| **npm** | [https://www.npmjs.com/package/conclave-sdk](https://www.npmjs.com/package/conclave-sdk) |
| **Install** | `npm install conclave-sdk @solana/web3.js` |
| **Source** | `conclave/packages/conclave-sdk/` |

**Quick example:**

```typescript
import { ConclaveClient, getRoomPda, getTreasuryPda } from "conclave-sdk";
import { PublicKey } from "@solana/web3.js";

const client = new ConclaveClient("https://your-indexer.xyz");
const rooms = await client.getRooms();
const room = await client.getRoom(rooms[0].address);
const proposals = await client.getRoomProposals(room.address);

const authority = new PublicKey("...");
const roomPda = getRoomPda(authority, "My DAO");
const treasuryPda = getTreasuryPda(roomPda);
```

See the [package README](conclave/packages/conclave-sdk/README.md) for full API and PDA reference.

---

## Future Roadmap

**AI agents as DAO delegates** — Autonomous agents that hold governance roles proportional to on-chain contributions. Agents propose budget releases from observed metrics; humans retain veto power. Delegate reputation tokens weight agent proposals.

**Full ZK vote tallying** — Replace commit-reveal with fully homomorphic or ZK-based tally so even the tallier learns nothing until finalization.

**Cross-DAO reputation** — Anonymous reputation (bronze/silver/gold) portable across Conclave rooms without linking wallets.

---

## License

ISC.
