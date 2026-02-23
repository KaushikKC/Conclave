/**
 * Quick test of conclave-sdk against a local indexer (http://localhost:3001).
 * Run: node scripts/test-local.js
 * Ensure the indexer is running: cd conclave/indexer && npm run dev
 */
const { ConclaveClient, getRoomPda, getTreasuryPda, CONCLAVE_PROGRAM_ID } = require("../dist/index.js");
const { PublicKey } = require("@solana/web3.js");

const INDEXER_URL = process.env.INDEXER_URL || "http://localhost:3001";

async function main() {
  console.log("Testing conclave-sdk against", INDEXER_URL, "\n");

  const client = new ConclaveClient(INDEXER_URL);

  // 1. API client
  const rooms = await client.getRooms();
  console.log("1. getRooms():", rooms.length, "room(s)");
  if (rooms.length > 0) {
    const room = await client.getRoom(rooms[0].address);
    console.log("   First room:", room.name, "|", room.address.slice(0, 8) + "...");
  }

  // 2. PDAs
  const authority = new PublicKey("11111111111111111111111111111111");
  const roomPda = getRoomPda(authority, "Test");
  const treasuryPda = getTreasuryPda(roomPda);
  console.log("2. PDAs:");
  console.log("   CONCLAVE_PROGRAM_ID:", CONCLAVE_PROGRAM_ID.toBase58());
  console.log("   getRoomPda(111..., 'Test'):", roomPda.toBase58());
  console.log("   getTreasuryPda(roomPda):", treasuryPda.toBase58());

  // 3. Health (if indexer has /health)
  try {
    const health = await fetch(INDEXER_URL + "/health").then((r) => r.json());
    console.log("3. Indexer /health:", health.status || "ok");
  } catch (e) {
    console.log("3. Indexer /health: (not reachable – is indexer running?)");
  }

  console.log("\nDone. conclave-sdk is working.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
