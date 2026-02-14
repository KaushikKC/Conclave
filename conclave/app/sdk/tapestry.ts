import { PublicKey } from "@solana/web3.js";

/**
 * Conclave <-> Tapestry Integration SDK
 *
 * Integrates with Tapestry (Solana's social graph protocol) to:
 * 1. Register Conclave rooms and members as Tapestry profiles
 * 2. Create social connections between DAO members
 * 3. Post governance activity (proposals, votes) as Tapestry content
 *
 * Tapestry API: https://api.usetapestry.dev/v1/
 * SDK: npm install socialfi
 *
 * Requires a Tapestry API key from https://app.usetapestry.dev/
 */

const TAPESTRY_API_BASE = "https://api.usetapestry.dev/v1";
const TAPESTRY_DEV_API_BASE = "https://api.dev.usetapestry.dev/v1";

export interface TapestryConfig {
  apiKey: string;
  useDevnet?: boolean;
}

export interface TapestryProfile {
  walletAddress: string;
  username: string;
  bio: string;
}

function getBaseUrl(config: TapestryConfig): string {
  return config.useDevnet ? TAPESTRY_DEV_API_BASE : TAPESTRY_API_BASE;
}

async function tapestryFetch(
  config: TapestryConfig,
  path: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<any> {
  const url = `${getBaseUrl(config)}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify({ ...body, apiKey: config.apiKey }) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tapestry API error (${res.status}): ${text}`);
  }
  return res.json();
}

// --- Profile Management ---

/**
 * Register a Conclave member as a Tapestry profile.
 * Uses findOrCreate to be idempotent — safe to call multiple times.
 */
export async function registerMemberProfile(
  config: TapestryConfig,
  walletAddress: string,
  username: string,
  bio: string,
): Promise<TapestryProfile> {
  const result = await tapestryFetch(config, "/profiles/findOrCreate", "POST", {
    walletAddress,
    username,
    bio,
    blockchain: "SOLANA",
    execution: "FAST_UNCONFIRMED",
  });
  return {
    walletAddress: result.walletAddress || walletAddress,
    username: result.username || username,
    bio: result.bio || bio,
  };
}

/**
 * Register a Conclave room as a Tapestry profile.
 * The room's authority wallet is used as the wallet address.
 */
export async function registerRoomProfile(
  config: TapestryConfig,
  roomName: string,
  authorityWallet: string,
  description: string,
): Promise<TapestryProfile> {
  return registerMemberProfile(
    config,
    authorityWallet,
    `conclave-room-${roomName}`,
    `Conclave DAO Room: ${description}`,
  );
}

// --- Social Connections ---

/**
 * Create a follow relationship when a member joins a room.
 * The member follows the room's profile.
 */
export async function createMemberRoomConnection(
  config: TapestryConfig,
  memberWallet: string,
  roomAuthorityWallet: string,
  roomName: string,
): Promise<void> {
  await tapestryFetch(config, "/connections/create", "POST", {
    startWalletAddress: memberWallet,
    endWalletAddress: roomAuthorityWallet,
    blockchain: "SOLANA",
    execution: "FAST_UNCONFIRMED",
  });
}

/**
 * Remove a follow relationship when a member leaves.
 */
export async function removeMemberRoomConnection(
  config: TapestryConfig,
  memberWallet: string,
  roomAuthorityWallet: string,
): Promise<void> {
  await tapestryFetch(config, "/connections/delete", "POST", {
    startWalletAddress: memberWallet,
    endWalletAddress: roomAuthorityWallet,
    blockchain: "SOLANA",
    execution: "FAST_UNCONFIRMED",
  });
}

// --- Content Posting ---

/**
 * Post a proposal creation event as Tapestry content.
 */
export async function postProposalCreated(
  config: TapestryConfig,
  creatorWallet: string,
  proposalTitle: string,
  proposalDescription: string,
  roomName: string,
): Promise<void> {
  await tapestryFetch(config, "/content/create", "POST", {
    walletAddress: creatorWallet,
    contentType: "TEXT",
    text: `[Conclave/${roomName}] New proposal: "${proposalTitle}" — ${proposalDescription}`,
    blockchain: "SOLANA",
    execution: "FAST_UNCONFIRMED",
  });
}

/**
 * Post a proposal finalization result as Tapestry content.
 */
export async function postProposalResult(
  config: TapestryConfig,
  creatorWallet: string,
  proposalTitle: string,
  roomName: string,
  yesVotes: number,
  noVotes: number,
): Promise<void> {
  const result = yesVotes > noVotes ? "PASSED" : yesVotes < noVotes ? "REJECTED" : "TIED";
  await tapestryFetch(config, "/content/create", "POST", {
    walletAddress: creatorWallet,
    contentType: "TEXT",
    text: `[Conclave/${roomName}] Proposal "${proposalTitle}" ${result} (${yesVotes} yes / ${noVotes} no)`,
    blockchain: "SOLANA",
    execution: "FAST_UNCONFIRMED",
  });
}

// --- Full Integration Flows ---

/**
 * Complete flow: When a room is created.
 * 1. Register room profile on Tapestry
 * 2. Register creator profile on Tapestry
 */
export async function onRoomCreated(
  config: TapestryConfig,
  roomName: string,
  authorityWallet: string,
  creatorUsername: string,
): Promise<void> {
  await registerRoomProfile(
    config,
    roomName,
    authorityWallet,
    `Governance room for ${roomName}`,
  );
  await registerMemberProfile(
    config,
    authorityWallet,
    creatorUsername,
    `Conclave DAO member`,
  );
}

/**
 * Complete flow: When a member joins a room.
 * 1. Register member profile on Tapestry
 * 2. Create follow connection to room
 */
export async function onMemberJoined(
  config: TapestryConfig,
  memberWallet: string,
  memberUsername: string,
  roomAuthorityWallet: string,
  roomName: string,
): Promise<void> {
  await registerMemberProfile(
    config,
    memberWallet,
    memberUsername,
    `Conclave DAO member`,
  );
  await createMemberRoomConnection(
    config,
    memberWallet,
    roomAuthorityWallet,
    roomName,
  );
}

/**
 * Complete flow: When a proposal is finalized.
 * Post the result to Tapestry social feed.
 */
export async function onProposalFinalized(
  config: TapestryConfig,
  creatorWallet: string,
  proposalTitle: string,
  roomName: string,
  yesVotes: number,
  noVotes: number,
): Promise<void> {
  await postProposalResult(
    config,
    creatorWallet,
    proposalTitle,
    roomName,
    yesVotes,
    noVotes,
  );
}
