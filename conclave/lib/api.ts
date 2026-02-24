// Normalize to no trailing slash so BASE_URL + "/path" never becomes "//path" (avoids 308 and CORS issues)
const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Not found");
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

// --- Types matching indexer responses ---

export interface ApiRoom {
  address: string;
  authority: string;
  governance_mint: string;
  name: string;
  member_count: number;
  proposal_count: number;
  created_at: number;
  indexed_at: number;
  realm_address: string | null;
}

export interface ApiMember {
  address: string;
  wallet: string;
  room: string;
  joined_at: number;
  indexed_at: number;
}

export interface ApiMessage {
  address: string;
  room: string;
  sender: string;
  ciphertext: string; // base64
  timestamp: number;
  indexed_at: number;
}

export interface ApiProposal {
  address: string;
  room: string;
  creator: string;
  title: string;
  description: string;
  vote_yes_count: number;
  vote_no_count: number;
  deadline: number;
  is_finalized: number; // 0 or 1
  indexed_at: number;
}

export interface ApiVoteCommitment {
  address: string;
  voter: string;
  proposal: string;
  is_revealed: number; // 0 or 1
  indexed_at: number;
}

/** Fetch rooms where the given wallet is a member */
export function fetchMyRooms(walletAddress: string): Promise<ApiRoom[]> {
  return fetchJSON(`/members/${walletAddress}/rooms`);
}

// --- Fetch functions ---

export function fetchRooms(): Promise<ApiRoom[]> {
  return fetchJSON("/rooms");
}

export function fetchRoom(address: string): Promise<ApiRoom> {
  return fetchJSON(`/rooms/${address}`);
}

export function fetchRoomMembers(address: string): Promise<ApiMember[]> {
  return fetchJSON(`/rooms/${address}/members`);
}

export function fetchRoomMessages(
  address: string,
  limit?: number,
  before?: number,
): Promise<ApiMessage[]> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (before) params.set("before", String(before));
  const qs = params.toString();
  return fetchJSON(`/rooms/${address}/messages${qs ? `?${qs}` : ""}`);
}

export function fetchRoomProposals(address: string): Promise<ApiProposal[]> {
  return fetchJSON(`/rooms/${address}/proposals`);
}

export function fetchProposal(address: string): Promise<ApiProposal> {
  return fetchJSON(`/proposals/${address}`);
}

export function fetchProposalVotes(
  address: string,
): Promise<ApiVoteCommitment[]> {
  return fetchJSON(`/proposals/${address}/votes`);
}

export async function fetchGroupKey(
  roomAddress: string,
): Promise<string | null> {
  try {
    const data = await fetchJSON<{ groupKey: string }>(
      `/rooms/${roomAddress}/key`,
    );
    return data.groupKey;
  } catch {
    return null;
  }
}

export async function postGroupKey(
  roomAddress: string,
  groupKeyBase64: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/rooms/${roomAddress}/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupKey: groupKeyBase64 }),
  });
  if (!res.ok) throw new Error(`Failed to post group key: ${res.status}`);
}

/** Store encrypted vote data in the indexer (backup for localStorage) */
export async function storeVoteData(
  proposal: string,
  voter: string,
  encryptedData: string,
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/votes/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal, voter, encryptedData }),
    });
  } catch {
    // Non-fatal
  }
}

/** Retrieve encrypted vote data from the indexer */
export async function fetchVoteData(
  proposal: string,
  voter: string,
): Promise<string | null> {
  try {
    const data = await fetchJSON<{ encryptedData: string }>(
      `/votes/data/${proposal}/${voter}`,
    );
    return data.encryptedData;
  } catch {
    return null;
  }
}

/** Delete a message from the indexer DB (after on-chain close_message) */
export async function deleteMessageFromIndexer(
  messageAddress: string,
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/messages/${messageAddress}`, { method: "DELETE" });
  } catch {
    // Non-fatal — indexer will drop it on next re-index when account is gone
  }
}

/** Relay an encrypted message directly to the indexer (fast path, no chain fetch needed) */
export async function postMessage(
  roomAddress: string,
  messageAddress: string,
  sender: string,
  ciphertextBase64: string,
  timestamp: number,
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/rooms/${roomAddress}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: messageAddress,
        sender,
        ciphertext: ciphertextBase64,
        timestamp,
      }),
    });
  } catch {
    // Non-fatal — indexer will pick it up on next poll
  }
}

/** Tell the indexer to fetch and index specific accounts immediately */
export async function notifyIndexer(accounts: string[]): Promise<void> {
  try {
    await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts }),
    });
  } catch {
    // Non-fatal — indexer will pick it up on next poll
  }
}

/** Push room data directly to indexer (bypasses RPC, avoids rate limits) */
export async function pushRoomToIndexer(
  address: string,
  authority: string,
  governance_mint: string,
  name: string,
  created_at: number,
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, authority, governance_mint, name, member_count: 0, proposal_count: 0, created_at }),
    });
  } catch (err) {
    console.warn("pushRoomToIndexer error:", err);
  }
}

/** Push member data directly to indexer (bypasses RPC, avoids rate limits) */
export async function pushMemberToIndexer(
  address: string,
  wallet: string,
  room: string,
  joined_at: number,
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, wallet, room, joined_at }),
    });
  } catch (err) {
    console.warn("pushMemberToIndexer error:", err);
  }
}

/** Link a room to a Realms DAO address in the indexer */
export async function postRoomRealm(
  roomAddress: string,
  realmAddress: string,
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/rooms/${roomAddress}/realm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ realmAddress }),
    });
    if (!res.ok) {
      console.warn(`postRoomRealm failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.warn("postRoomRealm error:", err);
  }
}

// --- Reputation ---

export interface ApiReputation {
  votes_cast: number;
  proposals_created: number;
  messages_sent: number;
  total: number;
  tier: "none" | "bronze" | "silver" | "gold";
}

/** Fetch anonymous reputation for a single wallet */
export async function fetchReputation(wallet: string): Promise<ApiReputation | null> {
  try {
    return await fetchJSON<ApiReputation>(`/reputation/${wallet}`);
  } catch {
    return null;
  }
}

/** Batch fetch reputation for multiple wallets (max 50) */
export async function fetchReputationBatch(
  wallets: string[],
): Promise<Record<string, ApiReputation>> {
  if (wallets.length === 0) return {};
  try {
    return await fetchJSON<Record<string, ApiReputation>>(
      `/reputation/batch?wallets=${wallets.join(",")}`,
    );
  } catch {
    return {};
  }
}

// --- ZK Identity ---

/** Register an anonymous Semaphore identity commitment for a room */
export async function postZKIdentity(
  roomPda: string,
  commitment: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/zk/identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomPda, commitment }),
  });
  if (!res.ok) throw new Error(`Failed to register ZK identity: ${res.status}`);
}

/** Fetch all identity commitments for a room's ZK group */
export async function fetchZKGroup(
  roomPda: string,
): Promise<string[]> {
  try {
    const data = await fetchJSON<{ commitments: string[]; size: number }>(
      `/zk/group/${roomPda}`,
    );
    return data.commitments;
  } catch {
    return [];
  }
}

export async function postGroupKeyWithRetry(
  roomAddress: string,
  groupKeyBase64: string,
  maxRetries = 5,
  delayMs = 3000,
): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await postGroupKey(roomAddress, groupKeyBase64);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoff = delayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastError;
}
