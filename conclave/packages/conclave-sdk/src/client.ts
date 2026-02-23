import type {
  ApiRoom,
  ApiMember,
  ApiMessage,
  ApiProposal,
  ApiVoteCommitment,
  ApiReputation,
} from "./types";

async function fetchJSON<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Not found");
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Conclave indexer API client. Use this to build bots, dashboards, or third-party integrations.
 */
export class ConclaveClient {
  constructor(public readonly baseUrl: string = "http://localhost:3001") {}

  /** List all rooms */
  async getRooms(): Promise<ApiRoom[]> {
    return fetchJSON(this.baseUrl, "/rooms");
  }

  /** Get a single room by address */
  async getRoom(address: string): Promise<ApiRoom> {
    return fetchJSON(this.baseUrl, `/rooms/${address}`);
  }

  /** Get members of a room */
  async getRoomMembers(roomAddress: string): Promise<ApiMember[]> {
    return fetchJSON(this.baseUrl, `/rooms/${roomAddress}/members`);
  }

  /** Get messages (paginated). `before` is unix timestamp; default limit 50, max 200. */
  async getRoomMessages(
    roomAddress: string,
    opts?: { limit?: number; before?: number }
  ): Promise<ApiMessage[]> {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.before != null) params.set("before", String(opts.before));
    const qs = params.toString();
    return fetchJSON(
      this.baseUrl,
      `/rooms/${roomAddress}/messages${qs ? `?${qs}` : ""}`
    );
  }

  /** Get proposals for a room */
  async getRoomProposals(roomAddress: string): Promise<ApiProposal[]> {
    return fetchJSON(this.baseUrl, `/rooms/${roomAddress}/proposals`);
  }

  /** Get a single proposal */
  async getProposal(address: string): Promise<ApiProposal> {
    return fetchJSON(this.baseUrl, `/proposals/${address}`);
  }

  /** Get vote commitments for a proposal */
  async getProposalVotes(proposalAddress: string): Promise<ApiVoteCommitment[]> {
    return fetchJSON(this.baseUrl, `/proposals/${proposalAddress}/votes`);
  }

  /** Get group key for a room (base64). Returns null if not available. */
  async getGroupKey(roomAddress: string): Promise<string | null> {
    try {
      const data = await fetchJSON<{ groupKey: string }>(
        this.baseUrl,
        `/rooms/${roomAddress}/key`
      );
      return data.groupKey ?? null;
    } catch {
      return null;
    }
  }

  /** Get rooms where a wallet is a member */
  async getRoomsForWallet(walletAddress: string): Promise<ApiRoom[]> {
    return fetchJSON(this.baseUrl, `/members/${walletAddress}/rooms`);
  }

  /** Get anonymous reputation for a wallet */
  async getReputation(walletAddress: string): Promise<ApiReputation | null> {
    try {
      return await fetchJSON<ApiReputation>(
        this.baseUrl,
        `/reputation/${walletAddress}`
      );
    } catch {
      return null;
    }
  }

  /** Get ZK identity commitments for a room (for proof verification) */
  async getZKGroup(roomPda: string): Promise<string[]> {
    try {
      const data = await fetchJSON<{ commitments: string[]; size: number }>(
        this.baseUrl,
        `/zk/group/${roomPda}`
      );
      return data.commitments ?? [];
    } catch {
      return [];
    }
  }
}
