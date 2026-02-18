import { Connection, PublicKey } from "@solana/web3.js";
import {
  getRealm,
  getTokenOwnerRecordForRealm,
  getAllGovernances,
  getAllProposals,
  ProposalState,
} from "@realms-today/spl-governance";

/**
 * Conclave <-> Realms Integration SDK
 *
 * Uses the official @realms-today/spl-governance SDK.
 *
 * SPL Governance Program ID (mainnet/devnet):
 * GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw
 */

export const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

/** Mainnet RPC for fetching real Realms DAO data */
const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

let _mainnetConnection: Connection | null = null;
export function getMainnetConnection(): Connection {
  if (!_mainnetConnection) {
    _mainnetConnection = new Connection(MAINNET_RPC, "confirmed");
  }
  return _mainnetConnection;
}

export interface RealmInfo {
  realmAddress: PublicKey;
  communityMint: PublicKey;
  councilMint: PublicKey | null;
  name: string;
  authority: PublicKey | null;
  votingProposalCount: number;
}

export interface TokenOwnerRecordInfo {
  realm: PublicKey;
  governingTokenMint: PublicKey;
  governingTokenOwner: PublicKey;
  governingTokenDepositAmount: { gt: (n: any) => boolean; gtn: (n: number) => boolean; toNumber: () => number };
  totalVotesCount: number;
}

export interface RealmsProposalInfo {
  pubkey: PublicKey;
  name: string;
  descriptionLink: string;
  state: ProposalState;
  yesVotes: number;
  noVotes: number;
  draftAt: number;
  votingAt: number | null;
  votingCompletedAt: number | null;
  governance: PublicKey;
}

export interface RealmsGovernanceInfo {
  pubkey: PublicKey;
  governedAccount: PublicKey;
  proposalCount: number;
  votingTime: number;
}

/**
 * Fetch realm info using official SDK.
 * Tries the provided connection first, falls back to mainnet.
 */
export async function fetchRealmInfo(
  connection: Connection,
  realmAddress: PublicKey
): Promise<RealmInfo | null> {
  // Try provided connection first (devnet), then mainnet
  const connections = [connection];
  const mainnet = getMainnetConnection();
  if (connection.rpcEndpoint !== mainnet.rpcEndpoint) {
    connections.push(mainnet);
  }

  for (const conn of connections) {
    try {
      const realm = await getRealm(conn, realmAddress);
      return {
        realmAddress,
        communityMint: realm.account.communityMint,
        councilMint: realm.account.config.councilMint || null,
        name: realm.account.name,
        authority: realm.account.authority || null,
        votingProposalCount: realm.account.votingProposalCount,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Verify that a wallet has a TokenOwnerRecord in the given Realm.
 * Uses official SDK deserialization.
 */
export async function verifyRealmsMembership(
  connection: Connection,
  realm: PublicKey,
  governingTokenMint: PublicKey,
  wallet: PublicKey
): Promise<TokenOwnerRecordInfo | null> {
  const connections = [connection];
  const mainnet = getMainnetConnection();
  if (connection.rpcEndpoint !== mainnet.rpcEndpoint) {
    connections.push(mainnet);
  }

  for (const conn of connections) {
    try {
      const record = await getTokenOwnerRecordForRealm(
        conn,
        SPL_GOVERNANCE_PROGRAM_ID,
        realm,
        governingTokenMint,
        wallet
      );
      return {
        realm: record.account.realm,
        governingTokenMint: record.account.governingTokenMint,
        governingTokenOwner: record.account.governingTokenOwner,
        governingTokenDepositAmount: record.account.governingTokenDepositAmount,
        totalVotesCount: record.account.totalVotesCount,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Fetch all governances for a Realm.
 */
export async function fetchRealmsGovernances(
  connection: Connection,
  realmAddress: PublicKey
): Promise<RealmsGovernanceInfo[]> {
  const connections = [connection];
  const mainnet = getMainnetConnection();
  if (connection.rpcEndpoint !== mainnet.rpcEndpoint) {
    connections.push(mainnet);
  }

  for (const conn of connections) {
    try {
      const governances = await getAllGovernances(
        conn,
        SPL_GOVERNANCE_PROGRAM_ID,
        realmAddress
      );
      return governances.map((g) => ({
        pubkey: g.pubkey,
        governedAccount: g.account.governedAccount,
        proposalCount: g.account.proposalCount,
        votingTime: g.account.config.baseVotingTime,
      }));
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Fetch all proposals for a Realm across all governances.
 * Returns them flattened and sorted by most recent first.
 */
export async function fetchRealmsProposals(
  connection: Connection,
  realmAddress: PublicKey
): Promise<RealmsProposalInfo[]> {
  const connections = [connection];
  const mainnet = getMainnetConnection();
  if (connection.rpcEndpoint !== mainnet.rpcEndpoint) {
    connections.push(mainnet);
  }

  for (const conn of connections) {
    try {
      const proposalsByGov = await getAllProposals(
        conn,
        SPL_GOVERNANCE_PROGRAM_ID,
        realmAddress
      );
      // getAllProposals returns Proposal[][] (one array per governance)
      const flat = proposalsByGov.flat();
      const mapped = flat.map((p) => ({
        pubkey: p.pubkey,
        name: p.account.name,
        descriptionLink: p.account.descriptionLink,
        state: p.account.state,
        yesVotes: p.account.getYesVoteCount().toNumber(),
        noVotes: p.account.getNoVoteCount().toNumber(),
        draftAt: p.account.draftAt.toNumber(),
        votingAt: p.account.votingAt?.toNumber() ?? null,
        votingCompletedAt: p.account.votingCompletedAt?.toNumber() ?? null,
        governance: p.account.governance,
      }));
      // Sort: voting first, then by most recent
      mapped.sort((a, b) => {
        const aActive = a.state === ProposalState.Voting ? 1 : 0;
        const bActive = b.state === ProposalState.Voting ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return b.draftAt - a.draftAt;
      });
      return mapped;
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Full flow: get governance mint from a Realm and verify membership.
 */
export async function getGovernanceMintForRealm(
  connection: Connection,
  realmAddress: PublicKey,
  creatorWallet: PublicKey
): Promise<{ governanceMint: PublicKey; isVerifiedMember: boolean }> {
  const realm = await fetchRealmInfo(connection, realmAddress);
  if (!realm) {
    throw new Error(`Realm not found: ${realmAddress.toBase58()}`);
  }

  const membership = await verifyRealmsMembership(
    connection,
    realmAddress,
    realm.communityMint,
    creatorWallet
  );

  return {
    governanceMint: realm.communityMint,
    isVerifiedMember: membership !== null && membership.governingTokenDepositAmount.gtn(0),
  };
}

// Re-export useful types from the SDK
export { ProposalState } from "@realms-today/spl-governance";
