# conclave-sdk

**Dev toolkit for [Conclave](https://github.com/your-org/conclave)** — rooms, proposals, PDAs, and indexer API. Build DAO tooling and Realms extensions on Solana.

## Install

```bash
npm install conclave-sdk @solana/web3.js
```

## Usage

### API client (indexer)

```ts
import { ConclaveClient } from "conclave-sdk";

const client = new ConclaveClient("https://your-indexer.com");

const rooms = await client.getRooms();
const room = await client.getRoom(rooms[0].address);
const members = await client.getRoomMembers(room.address);
const proposals = await client.getRoomProposals(room.address);
const groupKey = await client.getGroupKey(room.address);
```

### PDAs (program-derived addresses)

Use the same PDAs as the Conclave program when building with Anchor or raw Solana.

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
const treasuryPda = getTreasuryPda(roomPda);
```

### Types

All indexer response types are exported: `ApiRoom`, `ApiMember`, `ApiMessage`, `ApiProposal`, `ApiVoteCommitment`, `ApiReputation`.

## Use cases

- **Bots & scripts** — List rooms, proposals, and members without running a full UI.
- **Dashboards** — Build custom analytics or admin UIs on top of the indexer.
- **Realms extensions** — Use Conclave data inside a Realms plugin or companion app.
- **On-chain tooling** — Use PDAs and program ID to build additional instructions or integrations.

## License

ISC
