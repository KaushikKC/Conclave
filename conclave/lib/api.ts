const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
