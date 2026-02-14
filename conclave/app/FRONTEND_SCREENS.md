# Conclave — Frontend Screens Spec

Frontend screens needed for the Conclave DAO governance + private voting app.  
**Stack:** Next.js, React, Tailwind CSS, @solana/wallet-adapter, app SDK (realms, crypto, tapestry).

---

## 1. Landing / Home (`/`)

**Purpose:** Entry point; connect wallet, discover or create rooms.

**UI elements:**
- App logo / name and short tagline (e.g. “Private voting for DAOs”).
- **Connect wallet** (Solana wallet adapter).
- When connected:
  - **“Create room”** CTA → `/rooms/create`.
  - **“Browse rooms”** or **“My rooms”** → `/rooms`.
- Optional: short “How it works” (commit–reveal voting, encrypted chat, Realms link).
- Footer: network (Devnet), links.

**Data:** None required for initial render; optional: fetch “featured” or “recent” room count.

---

## 2. Create Room (`/rooms/create`)

**Purpose:** Create a new DaoRoom (creator generates group key and will encrypt it for members on join).

**UI elements:**
- **Room name** (required, max 50 chars).
- **Governance mint** (required): input or selector for the SPL token mint (e.g. from Realms realm).
  - Optional: “Link to Realms” — pick realm → auto-fill community/council mint.
- **Create** button → `create_room` instruction.
- Cancel / back to home.

**Data / actions:**
- Call program `create_room(authority, name, governance_mint)`.
- Client: generate `groupKey` (crypto SDK), keep in memory or secure storage for later use when members join (encrypt for each member).

**Validation:** Name length ≤ 50; valid mint pubkey.

---

## 3. Room List / Discover (`/rooms`)

**Purpose:** List DAO rooms; filter and open a room.

**UI elements:**
- **Tabs or filters:** “All rooms” / “I’m a member” (optional, if you store “my rooms”).
- List of rooms: card per room with:
  - Room name.
  - Governance mint (or token symbol if you resolve it).
  - Member count, proposal count.
  - “Open” / “View” → `/rooms/[roomPda]`.
- **Create room** link → `/rooms/create`.
- Empty state when no rooms.

**Data:** Fetch all `DaoRoom` accounts (program account query or indexer). Optional: filter by governance mint or realm.

---

## 4. Room Lobby (pre-join) (`/rooms/[roomPda]` when not a member)

**Purpose:** Show room details and allow user to join if they hold the governance token.

**UI elements:**
- Room name, governance mint (or symbol), member count, proposal count, created date.
- **Join room** button (enabled only if wallet holds ≥ 1 governance token).
  - If no tokens: message “You need the DAO governance token to join.”
- Optional: list of proposals (title, deadline, finalized or not) — read-only.
- **Back** to `/rooms`.

**Data / actions:**
- Load `DaoRoom` by `roomPda`.
- Check SPL token balance (or Realms TokenOwnerRecord) for connected wallet.
- On **Join**: `join_room` instruction; client must receive or derive `encrypted_group_key` (creator encrypts group key for this member and passes it in; or you have a separate flow where creator uploads encrypted keys). Per your design, `join_room` stores `encrypted_group_key` — so the invoker (new member) typically provides it; the room creator might need to have encrypted it off-chain and shared, or you have an “invite” flow. Clarify with program: who passes `encrypted_group_key` into `join_room`. Either way, UI: “Join” triggers the tx and any client-side encryption for the joining wallet.

**Validation:** Only show “Join” if token balance ≥ 1 (or Realms membership ok).

---

## 5. Room Dashboard (post-join) (`/rooms/[roomPda]` when member)

**Purpose:** Main hub for one room: chat, proposals, members.

**UI elements:**
- **Header:** Room name; “Leave” or “Room info” (no on-chain “leave” in your spec — optional later).
- **Tabs or sections:**
  1. **Chat** — see ChatRoom component.
  2. **Proposals** — list + “Create proposal” CTA.
  3. **Members** — see MemberList component.
- Decrypt and show room data using stored group key (from Member account or local storage after join).

**Data:** Load `DaoRoom`, `Member` (current user), `Message` list (for chat), `Proposal` list, member list. Decrypt messages client-side with group key.

---

## 6. Chat Room (component used in Room Dashboard)

**Purpose:** Encrypted group chat for room members.

**UI elements:**
- Message list (sender, decrypted text, timestamp).
- **Compose:** text input (max 1024 bytes ciphertext; you may limit plaintext length), **Send**.
- Optional: “Load more” / pagination for messages.

**Data / actions:**
- Fetch `Message` PDAs for room (seeds: `["message", room, sender, timestamp]` — you may need to fetch by room and filter).
- Decrypt each `ciphertext` with group key (crypto SDK).
- **Send:** `send_message(room, sender, ciphertext)`; encrypt plaintext with group key client-side, then submit.

**Validation:** Only members can send; ciphertext size ≤ 1024 bytes.

---

## 7. Proposals List (section or page under room)

**Purpose:** List proposals and navigate to create or vote.

**UI elements:**
- **“Create proposal”** button → `/rooms/[roomPda]/proposals/create`.
- List of proposals:
  - Title, description snippet, creator (pubkey or name), deadline, status (open / finalized).
  - If open: “Vote” → proposal detail.
  - If finalized: “Results” → proposal detail (reveal/results view).
- Sort: by deadline or created.

**Data:** Fetch all `Proposal` accounts for this room (`room` in seeds).

---

## 8. Create Proposal (`/rooms/[roomPda]/proposals/create`)

**Purpose:** Create a new proposal (only members).

**UI elements:**
- **Title** (required, max 100 chars).
- **Description** (required, max 500 chars).
- **Deadline** (date/time picker, must be future).
- **Create** → `create_proposal` instruction.
- Cancel → back to room proposals.

**Data / actions:** `create_proposal(room, creator, title, description, deadline)`.

**Validation:** Member only; title/description length; deadline > now.

---

## 9. Proposal Detail — Voting (open) (`/rooms/[roomPda]/proposals/[proposalPda]` before deadline)

**Purpose:** View proposal and cast commit–reveal vote.

**UI elements:**
- Title, full description, creator, deadline countdown.
- **Vote:** “Yes” / “No” (or “Abstain” if you add it later).
  - On submit: client computes `commitment = sha256(vote_choice + nonce)`, stores nonce locally (e.g. localStorage keyed by proposalPda), then **Cast vote** → `cast_vote(proposal, voter, commitment)`.
- Message: “Your vote is committed. It will be revealed after the deadline.”
- Optional: show “Commitments: N” (count of VoteCommitment PDAs) without revealing choices.

**Data / actions:**
- Load `Proposal` (room, creator, title, description, deadline, is_finalized).
- Check if current wallet has already cast: fetch `VoteCommitment` PDA (seeds: `["vote", proposal, voter]`).
- If already cast: show “You have already voted” and hide Yes/No buttons.
- `cast_vote`: submit commitment only; store (vote, nonce) in localStorage for this proposal.

**Validation:** Member only; deadline not passed; one vote per wallet per proposal.

---

## 10. Proposal Detail — Reveal & Results (after deadline) (`/rooms/[roomPda]/proposals/[proposalPda]` after deadline)

**Purpose:** Reveal own vote and see tally.

**UI elements:**
- Same proposal info; “Voting ended” or “Finalized”.
- **Reveal my vote:** If user had committed and not yet revealed, button “Reveal vote” → client reads (vote, nonce) from localStorage, calls `reveal_vote(proposal, voter, choice, nonce)`. After success, remove or mark revealed in UI.
- **Tally:** vote_yes_count, vote_no_count (from `Proposal` account).
- Optional: list of who revealed (from VoteCommitment accounts with is_revealed).

**Data / actions:**
- Load `Proposal` (vote_yes_count, vote_no_count, is_finalized).
- Load current user’s `VoteCommitment` (is_revealed). If committed and !is_revealed, show “Reveal” and call `reveal_vote` with stored (vote, nonce).
- Optional: “Finalize” instruction if you have an explicit finalize step; otherwise tally is updated on each reveal.

**Validation:** Only after deadline; commitment hash must match (vote + nonce).

---

## 11. Member List (component used in Room Dashboard)

**Purpose:** Show who is in the room (members only).

**UI elements:**
- List of members: wallet pubkey (shortened) or Tapestry identity if integrated.
- Optional: joined_at date.
- No sensitive data (encrypted_group_key is per-member and not shown).

**Data:** Fetch all `Member` accounts for room (seeds: `["member", room, wallet]` — need to enumerate by room; if program doesn’t support “all members by room”, you may need a separate index or iterate known wallets). Alternatively store member list in your backend/indexer.

---

## 12. Wallet / Connection (global)

**Purpose:** Show connection status and switch/connect wallet.

**UI elements:**
- Header or nav: “Connect wallet” (when disconnected); when connected: wallet icon, short address, “Disconnect” / “Change wallet”.
- Optional: Devnet indicator and “Copy address”.

**Implementation:** @solana/wallet-adapter (WalletMultiButton or custom).

---

## Summary Table

| # | Screen / Component      | Route / Location                    | Main actions                          |
|---|--------------------------|-------------------------------------|----------------------------------------|
| 1 | Landing                  | `/`                                 | Connect wallet, navigate create/rooms  |
| 2 | Create Room              | `/rooms/create`                     | create_room                            |
| 3 | Room List                | `/rooms`                            | List rooms, open room                  |
| 4 | Room Lobby (pre-join)    | `/rooms/[roomPda]`                  | join_room                              |
| 5 | Room Dashboard           | `/rooms/[roomPda]` (member)         | Chat, proposals, members               |
| 6 | ChatRoom                 | Component in dashboard              | send_message, decrypt messages         |
| 7 | Proposals List           | Section or /rooms/.../proposals     | List, “Create proposal”                |
| 8 | Create Proposal          | /rooms/[roomPda]/proposals/create   | create_proposal                        |
| 9 | Proposal (voting)        | /rooms/.../proposals/[proposalPda]  | cast_vote                              |
|10 | Proposal (reveal/results)| Same, after deadline                | reveal_vote, show tally                |
|11 | MemberList               | Component in dashboard              | Display members                        |
|12 | Wallet UI                | Global (header/nav)                 | Connect / disconnect                   |

---

## Suggested Build Order

1. **Layout + wallet:** Next.js app layout, Tailwind, wallet adapter, global nav with connect (Screen 12 + 1).
2. **Room list + create:** Rooms list page, create room page, wire `create_room` (Screens 2, 3).
3. **Room lobby + join:** Room detail by PDA, token check, `join_room` (Screen 4). Resolve who provides `encrypted_group_key` (creator vs joiner) and implement that flow.
4. **Room dashboard shell:** Tabs for Chat / Proposals / Members; load room + member check (Screen 5).
5. **Chat:** Message list, decrypt, send (Screen 6).
6. **Proposals list + create proposal:** List proposals, create proposal page (Screens 7, 8).
7. **Proposal vote + reveal:** Proposal detail, cast vote (commit), reveal and tally (Screens 9, 10).
8. **Member list:** Enumerate members and display (Screen 11).

This covers all instructions (create_room, join_room, send_message, cast_vote, reveal_vote) and the encryption flow on the client.
