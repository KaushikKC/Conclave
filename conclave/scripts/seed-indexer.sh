#!/bin/bash
# Seed the indexer with existing on-chain room/member data
# Run this after restarting the indexer: bash scripts/seed-indexer.sh

BASE="http://localhost:3001"

echo "Pushing rooms to indexer..."

# Room 1: Developers Room
curl -s -X POST "$BASE/rooms" -H "Content-Type: application/json" \
  -d '{"address":"jCwAwHAmbcdWCYundA8DvtNLEFDeVAELwCRowhEucuo","authority":"5WdDGh3YpCZ8siPjhVDRLDqwaaniJzFX4yXDKa7NGSRZ","governance_mint":"7erPbKArXMYV3qeha5aDqGcYK9Foy8yvAch9qBxZ3KsC","name":"Developers Room","member_count":0,"proposal_count":0}'
echo ""

# Room 2: Developer Room 2
curl -s -X POST "$BASE/rooms" -H "Content-Type: application/json" \
  -d '{"address":"8s7zMcSKH7wu1dsp7QKuGLb75gdjHwge562ncYTjtazx","authority":"5WdDGh3YpCZ8siPjhVDRLDqwaaniJzFX4yXDKa7NGSRZ","governance_mint":"7erPbKArXMYV3qeha5aDqGcYK9Foy8yvAch9qBxZ3KsC","name":"Developer Room 2","member_count":0,"proposal_count":0}'
echo ""

# Room 3: Developer Room 3
curl -s -X POST "$BASE/rooms" -H "Content-Type: application/json" \
  -d '{"address":"8aygK9SHJCr4p37FksTzMZCfHCUvzcm9y3YvGd7GyzWL","authority":"5WdDGh3YpCZ8siPjhVDRLDqwaaniJzFX4yXDKa7NGSRZ","governance_mint":"7erPbKArXMYV3qeha5aDqGcYK9Foy8yvAch9qBxZ3KsC","name":"Developer Room 3","member_count":0,"proposal_count":0}'
echo ""

echo ""
echo "Pushing members..."

# Members (wallet -> room)
# Wallet 5WdDGh3Y joined Developers Room
curl -s -X POST "$BASE/members" -H "Content-Type: application/json" \
  -d '{"address":"6FKsj3QAF1uLq22W4cZbsaRADNVw4zgK2LyVARZ7B2SW","wallet":"5WdDGh3YpCZ8siPjhVDRLDqwaaniJzFX4yXDKa7NGSRZ","room":"jCwAwHAmbcdWCYundA8DvtNLEFDeVAELwCRowhEucuo"}'
echo ""

# Wallet 5WdDGh3Y joined Developer Room 2
curl -s -X POST "$BASE/members" -H "Content-Type: application/json" \
  -d '{"address":"9Wd7jT7hanDUkrTCpWUoTBB6kkyFmBDcTcSCqc6UcHTy","wallet":"5WdDGh3YpCZ8siPjhVDRLDqwaaniJzFX4yXDKa7NGSRZ","room":"8s7zMcSKH7wu1dsp7QKuGLb75gdjHwge562ncYTjtazx"}'
echo ""

# Wallet 5WdDGh3Y joined Developer Room 3
curl -s -X POST "$BASE/members" -H "Content-Type: application/json" \
  -d '{"address":"37iHfRqqKCAMV4isyegNEVCuMcwXo3ZiZPLWWFqTPi1E","wallet":"5WdDGh3YpCZ8siPjhVDRLDqwaaniJzFX4yXDKa7NGSRZ","room":"8aygK9SHJCr4p37FksTzMZCfHCUvzcm9y3YvGd7GyzWL"}'
echo ""

# Wallet 7Yhb59f joined Developer Room 3 (JoinRoom tx)
curl -s -X POST "$BASE/members" -H "Content-Type: application/json" \
  -d '{"address":"3QHXWsSwJjCMAqjFbB1wNwFwcNgHEfEu6zYtNxxQuhyy","wallet":"7Yhb59f1wyrYopcHxsqzYUWNuuzhM1XVWQAKTAnatmes","room":"8aygK9SHJCr4p37FksTzMZCfHCUvzcm9y3YvGd7GyzWL"}'
echo ""

# Wallet 7Yhb59f joined Developers Room (from CxPuoX member PDA)
curl -s -X POST "$BASE/members" -H "Content-Type: application/json" \
  -d '{"address":"CxPuoXwkA1KmGnA7v6WU3ZUw4abcCMcmf3mBbq8H55Jt","wallet":"7Yhb59f1wyrYopcHxsqzYUWNuuzhM1XVWQAKTAnatmes","room":"jCwAwHAmbcdWCYundA8DvtNLEFDeVAELwCRowhEucuo"}'
echo ""

echo ""
echo "Linking Realm..."
# Link Developers Room to Realms DAO
curl -s -X POST "$BASE/rooms/jCwAwHAmbcdWCYundA8DvtNLEFDeVAELwCRowhEucuo/realm" -H "Content-Type: application/json" \
  -d '{"realmAddress":"HwxW2Lxxmv9qDZVFujC66xJvgiUGaiHczpgMARwXD1xB"}'
echo ""

echo ""
echo "Done! Checking..."
curl -s "$BASE/rooms" | python3 -c "import sys,json; rooms=json.load(sys.stdin); print(f'{len(rooms)} rooms:'); [print(f'  {r[\"name\"]} - members:{r[\"member_count\"]} realm:{r.get(\"realm_address\",\"none\")}') for r in rooms]"
