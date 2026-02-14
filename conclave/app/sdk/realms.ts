import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

/**
 * Conclave <-> Realms Integration SDK
 *
 * Integrates with SPL Governance (Realms) by:
 * 1. Verifying DAO membership via TokenOwnerRecord
 * 2. Deriving governance token mint from a Realm
 * 3. Providing helpers to create Conclave rooms linked to Realms DAOs
 *
 * SPL Governance Program ID (mainnet/devnet):
 * GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw
 */

const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

export interface RealmInfo {
  realmAddress: PublicKey;
  communityMint: PublicKey;
  councilMint: PublicKey | null;
  name: string;
}

export interface TokenOwnerRecordInfo {
  realm: PublicKey;
  governingTokenMint: PublicKey;
  governingTokenOwner: PublicKey;
  governingTokenDepositAmount: anchor.BN;
}

/**
 * Derive the Realm PDA address.
 */
export function getRealmAddress(name: string): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("governance"), Buffer.from(name)],
    SPL_GOVERNANCE_PROGRAM_ID
  );
  return address;
}

/**
 * Derive the TokenOwnerRecord PDA for a given realm, mint, and wallet.
 * This record proves that a wallet is a member of a Realms DAO.
 */
export function getTokenOwnerRecordAddress(
  realm: PublicKey,
  governingTokenMint: PublicKey,
  governingTokenOwner: PublicKey
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("governance"),
      realm.toBuffer(),
      governingTokenMint.toBuffer(),
      governingTokenOwner.toBuffer(),
    ],
    SPL_GOVERNANCE_PROGRAM_ID
  );
  return address;
}

/**
 * Fetch and verify that a wallet has a TokenOwnerRecord in the given Realm.
 * Returns the record info if found, null if the wallet is not a member.
 */
export async function verifyRealmsMembership(
  connection: Connection,
  realm: PublicKey,
  governingTokenMint: PublicKey,
  wallet: PublicKey
): Promise<TokenOwnerRecordInfo | null> {
  const torAddress = getTokenOwnerRecordAddress(
    realm,
    governingTokenMint,
    wallet
  );

  const accountInfo = await connection.getAccountInfo(torAddress);
  if (!accountInfo || accountInfo.data.length === 0) {
    return null;
  }

  // TokenOwnerRecord layout (simplified — key fields):
  // 0: account_type (1 byte)
  // 1-32: realm (32 bytes)
  // 33-64: governing_token_mint (32 bytes)
  // 65-96: governing_token_owner (32 bytes)
  // 97-104: governing_token_deposit_amount (u64, 8 bytes)
  const data = accountInfo.data;
  const realmPubkey = new PublicKey(data.slice(1, 33));
  const mint = new PublicKey(data.slice(33, 65));
  const owner = new PublicKey(data.slice(65, 97));
  const depositAmount = new anchor.BN(data.slice(97, 105), "le");

  return {
    realm: realmPubkey,
    governingTokenMint: mint,
    governingTokenOwner: owner,
    governingTokenDepositAmount: depositAmount,
  };
}

/**
 * Fetch realm info including community and council mints.
 */
export async function fetchRealmInfo(
  connection: Connection,
  realmAddress: PublicKey
): Promise<RealmInfo | null> {
  const accountInfo = await connection.getAccountInfo(realmAddress);
  if (!accountInfo || accountInfo.data.length === 0) {
    return null;
  }

  // Realm layout (simplified):
  // 0: account_type (1 byte)
  // 1-4: name_length (u32)
  // 4+name_length: community_mint (32 bytes)
  // ... config ...
  // council_mint is optional
  const data = accountInfo.data;
  const nameLen = data.readUInt32LE(1);
  const name = data.slice(5, 5 + nameLen).toString("utf8");
  const communityMint = new PublicKey(data.slice(5 + nameLen, 5 + nameLen + 32));

  // Council mint presence depends on config — simplified for hackathon
  return {
    realmAddress,
    communityMint,
    councilMint: null,
    name,
  };
}

/**
 * Derive the Governance PDA for a given realm and governed account.
 */
export function getGovernanceAddress(
  realm: PublicKey,
  governedAccount: PublicKey
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("account-governance"),
      realm.toBuffer(),
      governedAccount.toBuffer(),
    ],
    SPL_GOVERNANCE_PROGRAM_ID
  );
  return address;
}

/**
 * Derive the Proposal PDA for a Realms governance proposal.
 */
export function getRealmsProposalAddress(
  governance: PublicKey,
  governingTokenMint: PublicKey,
  proposalIndex: number
): PublicKey {
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUInt32LE(proposalIndex);
  const [address] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("governance"),
      governance.toBuffer(),
      governingTokenMint.toBuffer(),
      indexBuffer,
    ],
    SPL_GOVERNANCE_PROGRAM_ID
  );
  return address;
}

/**
 * Full flow: Create a Conclave room linked to a Realms DAO.
 *
 * 1. Fetch the Realm to get the community mint
 * 2. Verify the creator is a member of the Realm
 * 3. Use the community mint as the governance_mint for the Conclave room
 *
 * Returns the governance mint to use with create_room.
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
    isVerifiedMember: membership !== null && membership.governingTokenDepositAmount.gt(new anchor.BN(0)),
  };
}
