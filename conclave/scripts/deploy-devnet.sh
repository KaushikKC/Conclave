#!/bin/bash
set -e

echo "=== Conclave Devnet Deployment ==="

# Ensure we're on devnet
solana config set --url https://api.devnet.solana.com

# Check wallet balance
BALANCE=$(solana balance | awk '{print $1}')
echo "Wallet balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l) )); then
  echo "Requesting airdrop..."
  solana airdrop 2
  sleep 5
fi

# Build
echo "Building program..."
anchor build

# Deploy
echo "Deploying to devnet..."
anchor deploy --provider.cluster devnet

# Get program ID from keypair
PROGRAM_ID=$(solana address -k target/deploy/conclave-keypair.json)
echo "Program deployed at: $PROGRAM_ID"

# Initialize IDL on-chain
echo "Publishing IDL..."
anchor idl init --provider.cluster devnet --filepath target/idl/conclave.json "$PROGRAM_ID" || \
  anchor idl upgrade --provider.cluster devnet --filepath target/idl/conclave.json "$PROGRAM_ID"

echo "=== Deployment complete ==="
echo "Program ID: $PROGRAM_ID"
echo "IDL: target/idl/conclave.json"
