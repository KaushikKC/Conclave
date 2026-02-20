import { Connection, PublicKey } from "@solana/web3.js";
import {
  getRealm,
  getTokenOwnerRecordForRealm,
  getAllProposals,
  ProposalState,
} from "@realms-today/spl-governance";
import type { ProgramAccount, Proposal } from "@realms-today/spl-governance";

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

/**
 * Fetch realm info using official SDK.
 * Uses the provided connection (devnet).
 */
export async function fetchRealmInfo(
  connection: Connection,
  realmAddress: PublicKey
): Promise<RealmInfo | null> {
  try {
    const realm = await getRealm(connection, realmAddress);
    return {
      realmAddress,
      communityMint: realm.account.communityMint,
      councilMint: realm.account.config.councilMint || null,
      name: realm.account.name,
      authority: realm.account.authority || null,
      votingProposalCount: realm.account.votingProposalCount,
    };
  } catch {
    return null;
  }
}

/**
 * Verify that a wallet has a TokenOwnerRecord in the given Realm.
 */
export async function verifyRealmsMembership(
  connection: Connection,
  realm: PublicKey,
  governingTokenMint: PublicKey,
  wallet: PublicKey
): Promise<TokenOwnerRecordInfo | null> {
  try {
    const record = await getTokenOwnerRecordForRealm(
      connection,
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
    return null;
  }
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

export interface RealmProposal {
  pubkey: string;
  name: string;
  descriptionLink: string;
  state: ProposalState;
  yesVotes: string;
  noVotes: string;
  votingAt: number | null;
  votingCompletedAt: number | null;
}

/**
 * Fetch all proposals from a Realms DAO.
 * Uses getAllProposals which calls getProgramAccounts — may be rate-limited on devnet.
 * Returns [] on failure so callers don't break.
 */
export async function fetchRealmProposals(
  connection: Connection,
  realmAddress: PublicKey
): Promise<RealmProposal[]> {
  try {
    const proposalsByGovernance = await getAllProposals(
      connection,
      SPL_GOVERNANCE_PROGRAM_ID,
      realmAddress
    );
    // getAllProposals returns Proposal[][] (grouped by governance), flatten them
    const allProposals: ProgramAccount<Proposal>[] = proposalsByGovernance.flat();

    return allProposals.map((p) => ({
      pubkey: p.pubkey.toBase58(),
      name: p.account.name,
      descriptionLink: p.account.descriptionLink,
      state: p.account.state,
      yesVotes: p.account.yesVotesCount.toString(),
      noVotes: p.account.noVotesCount.toString(),
      votingAt: p.account.votingAt ? p.account.votingAt.toNumber() : null,
      votingCompletedAt: p.account.votingCompletedAt
        ? p.account.votingCompletedAt.toNumber()
        : null,
    }));
  } catch (err) {
    console.warn("Failed to fetch Realms proposals:", err);
    return [];
  }
}

// Re-export useful types from the SDK
export { ProposalState } from "@realms-today/spl-governance";
