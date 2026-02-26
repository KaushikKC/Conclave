# conclave-sdk

**JavaScript/TypeScript SDK for [Conclave](https://conclave-dao.xyz)** — the privacy layer for Solana DAOs. Query rooms, proposals, members, and messages from the Conclave indexer; compute the same PDAs (program-derived addresses) as the Conclave Anchor program for building custom tooling, bots, and Realms extensions.

- **npm:** [https://www.npmjs.com/package/conclave-sdk](https://www.npmjs.com/package/conclave-sdk)
- **Conclave app:** [https://conclave-dao.xyz/](https://conclave-dao.xyz/)

---

## Install

```bash
npm install conclave-sdk @solana/web3.js
```

**Peer dependency:** `@solana/web3.js` (^1.90.0) is required for `PublicKey` and PDA helpers.

---

## ConclaveClient (indexer API)

Connect to a Conclave indexer (your own or the public API) to read rooms, proposals, members, and more.

```ts
import { ConclaveClient } from "conclave-sdk";

const client = new ConclaveClient("https://your-indexer.xyz");
// Or default: "http://localhost:3001"
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getRooms()` | `Promise<ApiRoom[]>` | List all rooms |
| `getRoom(address)` | `Promise<ApiRoom>` | Get a room by PDA |
| `getRoomMembers(roomAddress)` | `Promise<ApiMember[]>` | Members of a room |
| `getRoomMessages(roomAddress, opts?)` | `Promise<ApiMessage[]>` | Paginated messages; `opts`: `{ limit?, before? }` |
| `getRoomProposals(roomAddress)` | `Promise<ApiProposal[]>` | Proposals for a room |
| `getProposal(address)` | `Promise<ApiProposal>` | Get a proposal by PDA |
| `getProposalVotes(proposalAddress)` | `Promise<ApiVoteCommitment[]>` | Vote commitments for a proposal |
| `getGroupKey(roomAddress)` | `Promise<string \| null>` | Room group key (base64); null if not set |
| `getRoomsForWallet(walletAddress)` | `Promise<ApiRoom[]>` | Rooms where the wallet is a member |
| `getReputation(walletAddress)` | `Promise<ApiReputation \| null>` | Anonymous reputation (votes, tier) |
| `getZKGroup(roomPda)` | `Promise<string[]>` | ZK identity commitments for a room |

### Example

```ts
const client = new ConclaveClient("https://your-indexer.xyz");

const rooms = await client.getRooms();
const room = await client.getRoom(rooms[0].address);
const members = await client.getRoomMembers(room.address);
const proposals = await client.getRoomProposals(room.address);
const messages = await client.getRoomMessages(room.address, { limit: 20 });
const groupKey = await client.getGroupKey(room.address);
```

---

## PDAs (program-derived addresses)

Use the same seeds as the Conclave program so your app or script derives the same addresses. All helpers accept an optional `programId` (default: Conclave program ID).

| Function | Seeds | Description |
|----------|-------|-------------|
| `getRoomPda(authority, name)` | `["room", authority, name]` | Room account |
| `getMemberPda(room, wallet)` | `["member", room, wallet]` | Member in a room |
| `getProposalPda(room, title)` | `["proposal", room, title]` | Proposal account |
| `getVoteCommitmentPda(proposal, voter)` | `["vote", proposal, voter]` | Vote commitment |
| `getMessagePda(room, sender, timestamp)` | `["message", room, sender, timestamp_le]` | Message account |
| `getSessionPda(room, owner)` | `["session", room, owner]` | Session key (gasless chat) |
| `getTreasuryPda(room)` | `["treasury", room]` | Room treasury |

**Constant:** `CONCLAVE_PROGRAM_ID` — Conclave program ID on Solana (devnet/mainnet).

### Example

```ts
import {
  CONCLAVE_PROGRAM_ID,
  getRoomPda,
  getMemberPda,
  getProposalPda,
  getTreasuryPda,
} from "conclave-sdk";
import { PublicKey } from "@solana/web3.js";

const authority = new PublicKey("...");
const roomPda = getRoomPda(authority, "My DAO");
const memberPda = getMemberPda(roomPda, walletPubkey);
const proposalPda = getProposalPda(roomPda, "Grant 0.1 SOL");
const treasuryPda = getTreasuryPda(roomPda);
```

---

## Types

All indexer response types are exported for TypeScript:

| Type | Description |
|------|-------------|
| `ApiRoom` | Room: address, authority, governance_mint, name, member_count, proposal_count, created_at, realm_address |
| `ApiMember` | Member: address, wallet, room, joined_at |
| `ApiMessage` | Message: address, room, sender, ciphertext (base64), timestamp |
| `ApiProposal` | Proposal: address, room, creator, title, description, vote_yes_count, vote_no_count, deadline, is_finalized |
| `ApiVoteCommitment` | Vote commitment: address, voter, proposal, is_revealed |
| `ApiReputation` | Reputation: votes_cast, proposals_created, messages_sent, total, tier |

---

## Use cases

- **Bots & scripts** — List rooms, proposals, and members; automate notifications or reporting.
- **Dashboards** — Build custom analytics or admin UIs on top of the indexer.
- **Realms extensions** — Use Conclave data inside a Realms plugin or companion app.
- **On-chain tooling** — Use PDAs and program ID to build additional instructions or integrations (e.g. Anchor, raw Solana).

---

## Links

- **Conclave app:** [https://conclave-dao.xyz/](https://conclave-dao.xyz/)
- **npm package:** [https://www.npmjs.com/package/conclave-sdk](https://www.npmjs.com/package/conclave-sdk)
- **Main repo:** [Conclave](https://github.com/KaushikKC/Conclave) (source for the app and program)

---

## License

ISC
