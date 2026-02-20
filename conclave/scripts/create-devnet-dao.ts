/**
 * Create a Realms DAO on devnet programmatically.
 *
 * This script:
 * 1. Creates an SPL token (governance token)
 * 2. Mints tokens to your wallet
 * 3. Creates a Realm (DAO) on devnet via SPL Governance
 * 4. Deposits governing tokens to become a member
 * 5. Creates a governance (wallet/treasury)
 * 6. Creates a sample proposal
 *
 * Usage: npx ts-node scripts/create-devnet-dao.ts [optional-dao-name]
 *
 * Prerequisites:
 * - Solana CLI configured to devnet with a funded keypair
 * - `solana config set --url devnet`
 * - `solana airdrop 2` (if needed)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  withCreateRealm,
  withDepositGoverningTokens,
  withCreateGovernance,
  withCreateProposal,
  withSignOffProposal,
  MintMaxVoteWeightSource,
  VoteType,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  GovernanceConfig,
  getGovernanceProgramVersion,
} from "@realms-today/spl-governance";
import BN = require("bn.js");
import fs = require("fs");
import path = require("path");

const GOVERNANCE_PROGRAM_ID = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

const DEVNET_RPC = "https://api.devnet.solana.com";

async function main() {
  const daoName = process.argv[2] || `Conclave Test DAO ${Date.now() % 10000}`;

  console.log("=== Realms DAO Creator (Devnet) ===\n");

  // Load wallet keypair from Solana CLI config
  const keypairPath =
    process.env.KEYPAIR_PATH ||
    path.join(
      process.env.HOME || "~",
      ".config",
      "solana",
      "id.json"
    );
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  if (balance < 0.5 * 1e9) {
    console.log("\nInsufficient balance. Requesting airdrop...");
    const sig = await connection.requestAirdrop(wallet.publicKey, 2 * 1e9);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("Airdrop received!");
  }

  // Get program version
  console.log("\nDetecting SPL Governance version...");
  const programVersion = await getGovernanceProgramVersion(
    connection,
    GOVERNANCE_PROGRAM_ID
  );
  console.log(`Program version: ${programVersion}`);

  // Step 1: Create governance token
  console.log("\n--- Step 1: Creating governance token ---");
  const mintAuthority = wallet;
  const communityMint = await createMint(
    connection,
    wallet,
    mintAuthority.publicKey,
    null, // no freeze authority
    6 // 6 decimals
  );
  console.log(`Community mint: ${communityMint.toBase58()}`);

  // Step 2: Mint tokens to wallet
  console.log("\n--- Step 2: Minting tokens ---");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    communityMint,
    wallet.publicKey
  );
  const mintAmount = 1_000_000 * 1e6; // 1M tokens
  await mintTo(
    connection,
    wallet,
    communityMint,
    tokenAccount.address,
    mintAuthority,
    BigInt(mintAmount)
  );
  console.log(
    `Minted 1,000,000 tokens to ${tokenAccount.address.toBase58()}`
  );

  // Step 3: Create Realm
  console.log(`\n--- Step 3: Creating Realm "${daoName}" ---`);
  const createRealmIxs: TransactionInstruction[] = [];
  const realmAddress = await withCreateRealm(
    createRealmIxs,
    GOVERNANCE_PROGRAM_ID,
    programVersion,
    daoName,
    wallet.publicKey, // realm authority
    communityMint,
    wallet.publicKey, // payer
    undefined, // no council mint
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    new BN(1_000_000), // min community weight to create governance (1 token)
    undefined, // community token config
    undefined  // council token config
  );

  const realmTx = new Transaction().add(...createRealmIxs);
  await sendAndConfirmTransaction(connection, realmTx, [wallet]);
  console.log(`Realm created: ${realmAddress.toBase58()}`);

  // Step 4: Deposit governing tokens
  console.log("\n--- Step 4: Depositing governing tokens ---");
  const depositIxs: TransactionInstruction[] = [];
  const tokenOwnerRecord = await withDepositGoverningTokens(
    depositIxs,
    GOVERNANCE_PROGRAM_ID,
    programVersion,
    realmAddress,
    tokenAccount.address, // source
    communityMint,
    wallet.publicKey, // governing token owner
    wallet.publicKey, // source authority
    wallet.publicKey, // payer
    new BN(100_000 * 1e6) // deposit 100K tokens
  );
  const depositTx = new Transaction().add(...depositIxs);
  await sendAndConfirmTransaction(connection, depositTx, [wallet]);
  console.log(`Tokens deposited. TokenOwnerRecord: ${tokenOwnerRecord.toBase58()}`);

  // Step 5: Create Governance (treasury wallet)
  console.log("\n--- Step 5: Creating governance ---");
  const govConfigArgs = new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 60,
    }),
    minCommunityTokensToCreateProposal: new BN(1_000 * 1e6), // 1K tokens
    minInstructionHoldUpTime: 0,
    baseVotingTime: 3 * 24 * 60 * 60, // 3 days
    communityVoteTipping: VoteTipping.Early,
    minCouncilTokensToCreateProposal: new BN(1),
    councilVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    councilVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    communityVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    councilVoteTipping: VoteTipping.Disabled,
    votingCoolOffTime: 0,
    depositExemptProposalCount: 10,
  });

  const govIxs: TransactionInstruction[] = [];
  const governanceAddress = await withCreateGovernance(
    govIxs,
    GOVERNANCE_PROGRAM_ID,
    programVersion,
    realmAddress,
    undefined, // governed account (none = wallet governance)
    govConfigArgs,
    tokenOwnerRecord,
    wallet.publicKey, // payer
    wallet.publicKey  // create authority
  );
  const govTx = new Transaction().add(...govIxs);
  await sendAndConfirmTransaction(connection, govTx, [wallet]);
  console.log(`Governance created: ${governanceAddress.toBase58()}`);

  // Step 6: Create a sample proposal
  console.log("\n--- Step 6: Creating sample proposal ---");
  const proposalIxs: TransactionInstruction[] = [];
  const proposalAddress = await withCreateProposal(
    proposalIxs,
    GOVERNANCE_PROGRAM_ID,
    programVersion,
    realmAddress,
    governanceAddress,
    tokenOwnerRecord,
    "Should we expand the DAO treasury?",
    "This is a sample proposal created for testing Conclave integration with Realms.",
    communityMint,
    wallet.publicKey, // governance authority
    0, // proposal index
    VoteType.SINGLE_CHOICE,
    ["Approve"],
    true, // use deny option (Yes/No vote)
    wallet.publicKey // payer
  );

  // Sign off the proposal to move it to voting
  await withSignOffProposal(
    proposalIxs,
    GOVERNANCE_PROGRAM_ID,
    programVersion,
    realmAddress,
    governanceAddress,
    proposalAddress,
    wallet.publicKey, // signatory (creator)
    undefined, // signatory record
    tokenOwnerRecord
  );

  const proposalTx = new Transaction().add(...proposalIxs);
  await sendAndConfirmTransaction(connection, proposalTx, [wallet]);
  console.log(`Proposal created: ${proposalAddress.toBase58()}`);

  // Summary
  console.log("\n========================================");
  console.log("  DAO CREATED SUCCESSFULLY ON DEVNET!");
  console.log("========================================\n");
  console.log(`DAO Name:          ${daoName}`);
  console.log(`Realm Address:     ${realmAddress.toBase58()}`);
  console.log(`Community Mint:    ${communityMint.toBase58()}`);
  console.log(`Governance:        ${governanceAddress.toBase58()}`);
  console.log(`Proposal:          ${proposalAddress.toBase58()}`);
  console.log(`TokenOwnerRecord:  ${tokenOwnerRecord.toBase58()}`);
  console.log(`\nView on Realms UI:`);
  console.log(
    `  https://app.realms.today/dao/${realmAddress.toBase58()}?cluster=devnet`
  );
  console.log(`\nUse this Realm address in Conclave:`);
  console.log(`  ${realmAddress.toBase58()}`);
  console.log(
    `\nUse this Community Mint in Conclave (auto-filled via Realm lookup):`
  );
  console.log(`  ${communityMint.toBase58()}`);
}

main().catch((err) => {
  console.error("\nError:", err);
  process.exit(1);
});
