import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import Database from "better-sqlite3";
import express from "express";
import path from "path";
import fs from "fs";

// --- Config ---

const PROGRAM_ID = new PublicKey(
  "E5HrS48LBddCwXGdq4ULPB8bC8rihUReDmu9eRiPQieU",
);
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const WS_URL = process.env.WS_URL || "wss://api.devnet.solana.com";
const PORT = parseInt(process.env.PORT || "3001");
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "conclave.db");

// --- Database Setup ---

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    address TEXT PRIMARY KEY,
    authority TEXT NOT NULL,
    governance_mint TEXT NOT NULL,
    name TEXT NOT NULL,
    member_count INTEGER DEFAULT 0,
    proposal_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    address TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    room TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL,
    FOREIGN KEY (room) REFERENCES rooms(address)
  );

  CREATE TABLE IF NOT EXISTS proposals (
    address TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    creator TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    vote_yes_count INTEGER DEFAULT 0,
    vote_no_count INTEGER DEFAULT 0,
    deadline INTEGER NOT NULL,
    is_finalized INTEGER DEFAULT 0,
    indexed_at INTEGER NOT NULL,
    FOREIGN KEY (room) REFERENCES rooms(address)
  );

  CREATE TABLE IF NOT EXISTS messages (
    address TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    sender TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL,
    FOREIGN KEY (room) REFERENCES rooms(address)
  );

  CREATE TABLE IF NOT EXISTS vote_commitments (
    address TEXT PRIMARY KEY,
    voter TEXT NOT NULL,
    proposal TEXT NOT NULL,
    is_revealed INTEGER DEFAULT 0,
    indexed_at INTEGER NOT NULL,
    FOREIGN KEY (proposal) REFERENCES proposals(address)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    data TEXT NOT NULL,
    signature TEXT NOT NULL,
    slot INTEGER NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_members_room ON members(room);
  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room);
  CREATE INDEX IF NOT EXISTS idx_messages_room_ts ON messages(room, timestamp);
  CREATE INDEX IF NOT EXISTS idx_proposals_room ON proposals(room);
  CREATE INDEX IF NOT EXISTS idx_vote_commitments_proposal ON vote_commitments(proposal);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

  CREATE TABLE IF NOT EXISTS group_keys (
    room TEXT PRIMARY KEY,
    group_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// --- Prepared Statements ---

const upsertRoom = db.prepare(`
  INSERT OR REPLACE INTO rooms (address, authority, governance_mint, name, member_count, proposal_count, created_at, indexed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertMember = db.prepare(`
  INSERT OR REPLACE INTO members (address, wallet, room, joined_at, indexed_at)
  VALUES (?, ?, ?, ?, ?)
`);

const upsertProposal = db.prepare(`
  INSERT OR REPLACE INTO proposals (address, room, creator, title, description, vote_yes_count, vote_no_count, deadline, is_finalized, indexed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertMessage = db.prepare(`
  INSERT OR REPLACE INTO messages (address, room, sender, ciphertext, timestamp, indexed_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const upsertVoteCommitment = db.prepare(`
  INSERT OR REPLACE INTO vote_commitments (address, voter, proposal, is_revealed, indexed_at)
  VALUES (?, ?, ?, ?, ?)
`);

const insertEvent = db.prepare(`
  INSERT INTO events (event_type, data, signature, slot, timestamp)
  VALUES (?, ?, ?, ?, ?)
`);

const deleteMessage = db.prepare(`DELETE FROM messages WHERE address = ?`);
const deleteVoteCommitment = db.prepare(
  `DELETE FROM vote_commitments WHERE address = ?`,
);

// --- IDL Loading ---

const idlPath = path.join(__dirname, "..", "target", "idl", "conclave.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
const accountsCoder = new anchor.BorshAccountsCoder(idl);

// --- Account Polling ---

const connection = new Connection(RPC_URL, {
  wsEndpoint: WS_URL,
  commitment: "confirmed",
});

async function indexAllAccounts() {
  console.log("Indexing all program accounts...");
  const now = Math.floor(Date.now() / 1000);

  const accounts = await connection.getProgramAccounts(PROGRAM_ID);
  console.log(`Found ${accounts.length} accounts`);

  // First pass: decode and collect by type so we insert in FK order (rooms → members → proposals → messages → vote_commitments)
  type RoomRow = [
    string,
    string,
    string,
    string,
    number,
    number,
    number,
    number,
  ];
  type MemberRow = [string, string, string, number, number];
  type ProposalRow = [
    string,
    string,
    string,
    string,
    string,
    number,
    number,
    number,
    number,
    number,
  ];
  type MessageRow = [string, string, string, string, number, number];
  type VoteRow = [string, string, string, number, number];

  const rooms: RoomRow[] = [];
  const members: MemberRow[] = [];
  const proposals: ProposalRow[] = [];
  const messages: MessageRow[] = [];
  const voteCommitments: VoteRow[] = [];

  for (const { pubkey, account } of accounts) {
    const address = pubkey.toBase58();
    const data = account.data;

    try {
      const decoded = accountsCoder.decode("DaoRoom", data);
      rooms.push([
        address,
        decoded.authority.toBase58(),
        decoded.governanceMint.toBase58(),
        decoded.name,
        decoded.memberCount,
        decoded.proposalCount,
        decoded.createdAt.toNumber(),
        now,
      ]);
      continue;
    } catch {}

    try {
      const decoded = accountsCoder.decode("Member", data);
      members.push([
        address,
        decoded.wallet.toBase58(),
        decoded.room.toBase58(),
        decoded.joinedAt.toNumber(),
        now,
      ]);
      continue;
    } catch {}

    try {
      const decoded = accountsCoder.decode("Proposal", data);
      proposals.push([
        address,
        decoded.room.toBase58(),
        decoded.creator.toBase58(),
        decoded.title,
        decoded.description,
        decoded.voteYesCount,
        decoded.voteNoCount,
        decoded.deadline.toNumber(),
        decoded.isFinalized ? 1 : 0,
        now,
      ]);
      continue;
    } catch {}

    try {
      const decoded = accountsCoder.decode("Message", data);
      messages.push([
        address,
        decoded.room.toBase58(),
        decoded.sender.toBase58(),
        Buffer.from(decoded.ciphertext).toString("base64"),
        decoded.timestamp.toNumber(),
        now,
      ]);
      continue;
    } catch {}

    try {
      const decoded = accountsCoder.decode("VoteCommitment", data);
      voteCommitments.push([
        address,
        decoded.voter.toBase58(),
        decoded.proposal.toBase58(),
        decoded.isRevealed ? 1 : 0,
        now,
      ]);
      continue;
    } catch {}
  }

  // Build sets of valid FK targets (this batch + already in DB) so we never insert orphans
  const validRooms = new Set<string>(rooms.map((r) => r[0]));
  (
    db.prepare("SELECT address FROM rooms").all() as { address: string }[]
  ).forEach((r) => validRooms.add(r.address));
  const validProposals = new Set<string>(proposals.map((p) => p[0]));
  (
    db.prepare("SELECT address FROM proposals").all() as { address: string }[]
  ).forEach((p) => validProposals.add(p.address));

  const membersOk = members.filter((m) => validRooms.has(m[2]));
  const proposalsOk = proposals.filter((p) => validRooms.has(p[1]));
  const messagesOk = messages.filter((m) => validRooms.has(m[1]));
  const voteCommitmentsOk = voteCommitments.filter((v) =>
    validProposals.has(v[2]),
  );

  if (
    membersOk.length < members.length ||
    proposalsOk.length < proposals.length ||
    messagesOk.length < messages.length ||
    voteCommitmentsOk.length < voteCommitments.length
  ) {
    console.warn("Skipped some rows (missing FK):", {
      members: members.length - membersOk.length,
      proposals: proposals.length - proposalsOk.length,
      messages: messages.length - messagesOk.length,
      votes: voteCommitments.length - voteCommitmentsOk.length,
    });
  }

  // Second pass: insert in dependency order to satisfy FOREIGN KEYs
  for (const row of rooms) upsertRoom.run(...row);
  for (const row of membersOk) upsertMember.run(...row);
  for (const row of proposalsOk) upsertProposal.run(...row);
  for (const row of messagesOk) upsertMessage.run(...row);
  for (const row of voteCommitmentsOk) upsertVoteCommitment.run(...row);

  console.log("Indexing complete");
}

/** Fetch a single room from chain and insert into DB if missing (so group_keys FK is satisfied). */
async function ensureRoomInDb(roomAddress: string): Promise<boolean> {
  if (db.prepare("SELECT 1 FROM rooms WHERE address = ?").get(roomAddress)) {
    return true;
  }
  try {
    const pubkey = new PublicKey(roomAddress);
    const accountInfo = await connection.getAccountInfo(pubkey);
    if (!accountInfo || !accountInfo.data.length) return false;
    const decoded = accountsCoder.decode("DaoRoom", accountInfo.data);
    const now = Math.floor(Date.now() / 1000);
    upsertRoom.run(
      roomAddress,
      decoded.authority.toBase58(),
      decoded.governanceMint.toBase58(),
      decoded.name,
      decoded.memberCount,
      decoded.proposalCount,
      decoded.createdAt.toNumber(),
      now,
    );
    return true;
  } catch {
    return false;
  }
}

// --- Log Subscription (Real-time) ---

function subscribeToLogs() {
  console.log("Subscribing to program logs...");

  connection.onLogs(
    PROGRAM_ID,
    async (logs) => {
      const { signature, logs: logMessages } = logs;

      for (const log of logMessages) {
        if (log.startsWith("Program data:")) {
          const eventData = log.replace("Program data: ", "");
          const slot = 0; // We'd need to fetch the tx for the actual slot
          const now = Math.floor(Date.now() / 1000);

          // Parse event type from the base64 data
          const decoded = Buffer.from(eventData, "base64");
          const discriminator = decoded.slice(0, 8).toString("hex");

          let eventType = "unknown";
          // Event discriminators are sha256("event:<EventName>")[0..8]
          // We store raw and let consumers filter
          insertEvent.run(eventType, eventData, signature, slot, now);
        }
      }

      // Re-index affected accounts after any transaction
      // In production, you'd parse the tx to know which accounts changed
      // For hackathon, we do a lightweight re-index every N seconds
    },
    "confirmed",
  );
}

// Periodic re-index to catch any missed updates
setInterval(async () => {
  try {
    await indexAllAccounts();
  } catch (err) {
    console.error("Re-index error:", err);
  }
}, 30_000); // Every 30 seconds

// --- REST API ---

const app = express();
app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

// GET /rooms
app.get("/rooms", (_req, res) => {
  const rooms = db
    .prepare("SELECT * FROM rooms ORDER BY created_at DESC")
    .all();
  res.json(rooms);
});

// GET /rooms/:address
app.get("/rooms/:address", (req, res) => {
  const room = db
    .prepare("SELECT * FROM rooms WHERE address = ?")
    .get(req.params.address);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(room);
});

// GET /rooms/:address/members
app.get("/rooms/:address/members", (req, res) => {
  const members = db
    .prepare("SELECT * FROM members WHERE room = ? ORDER BY joined_at ASC")
    .all(req.params.address);
  res.json(members);
});

// GET /rooms/:address/messages
app.get("/rooms/:address/messages", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const before =
    parseInt(req.query.before as string) || Math.floor(Date.now() / 1000) + 1;
  const messages = db
    .prepare(
      "SELECT * FROM messages WHERE room = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?",
    )
    .all(req.params.address, before, limit);
  res.json(messages);
});

// GET /rooms/:address/proposals
app.get("/rooms/:address/proposals", (req, res) => {
  const proposals = db
    .prepare("SELECT * FROM proposals WHERE room = ? ORDER BY deadline DESC")
    .all(req.params.address);
  res.json(proposals);
});

// GET /proposals/:address
app.get("/proposals/:address", (req, res) => {
  const proposal = db
    .prepare("SELECT * FROM proposals WHERE address = ?")
    .get(req.params.address);
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  res.json(proposal);
});

// GET /proposals/:address/votes
app.get("/proposals/:address/votes", (req, res) => {
  const votes = db
    .prepare("SELECT * FROM vote_commitments WHERE proposal = ?")
    .all(req.params.address);
  res.json(votes);
});

// GET /members/:wallet/rooms
app.get("/members/:wallet/rooms", (req, res) => {
  const memberships = db
    .prepare(
      `
      SELECT r.* FROM rooms r
      INNER JOIN members m ON m.room = r.address
      WHERE m.wallet = ?
      ORDER BY r.created_at DESC
    `,
    )
    .all(req.params.wallet);
  res.json(memberships);
});

// GET /events
app.get("/events", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const events = db
    .prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?")
    .all(limit);
  res.json(events);
});

// POST /rooms/:address/key
app.post("/rooms/:address/key", async (req, res) => {
  const { groupKey } = req.body;
  if (!groupKey || typeof groupKey !== "string") {
    return res.status(400).json({ error: "groupKey (base64 string) required" });
  }
  const roomAddress = req.params.address;
  const now = Math.floor(Date.now() / 1000);

  // Store key immediately — no need to wait for the room to be indexed.
  // The room will appear on the next poll cycle; the key is stored independently.
  db.prepare(
    "INSERT OR REPLACE INTO group_keys (room, group_key, created_at) VALUES (?, ?, ?)",
  ).run(roomAddress, groupKey, now);
  console.log(`Stored group key for room ${roomAddress}`);
  res.json({ ok: true });
});

// GET /rooms/:address/key
app.get("/rooms/:address/key", (req, res) => {
  const row = db
    .prepare("SELECT group_key FROM group_keys WHERE room = ?")
    .get(req.params.address) as any;
  if (!row) return res.status(404).json({ error: "No group key found" });
  res.json({ groupKey: row.group_key });
});

// GET /health
app.get("/health", (_req, res) => {
  const roomCount = db
    .prepare("SELECT COUNT(*) as count FROM rooms")
    .get() as any;
  res.json({
    status: "ok",
    rooms: roomCount.count,
    rpc: RPC_URL,
    program: PROGRAM_ID.toBase58(),
  });
});

// --- Start ---

async function main() {
  console.log(`Conclave Indexer starting...`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);

  await indexAllAccounts();
  subscribeToLogs();

  app.listen(PORT, () => {
    console.log(`REST API listening on http://localhost:${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  GET /rooms`);
    console.log(`  GET /rooms/:address`);
    console.log(`  GET /rooms/:address/members`);
    console.log(`  GET /rooms/:address/messages`);
    console.log(`  GET /rooms/:address/proposals`);
    console.log(`  GET /proposals/:address`);
    console.log(`  GET /proposals/:address/votes`);
    console.log(`  GET /members/:wallet/rooms`);
    console.log(`  GET /events`);
    console.log(`  GET /health`);
  });
}

main().catch(console.error);
