import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";

/**
 * Conclave Encryption SDK
 *
 * Uses TweetNaCl for all crypto operations:
 * - Group key: 32-byte random symmetric key (secretbox)
 * - Per-member key wrapping: nacl.box (X25519 + XSalsa20-Poly1305)
 * - Message encryption: nacl.secretbox (XSalsa20-Poly1305)
 *
 * Ed25519 keypairs from Solana wallets are converted to X25519 for
 * Diffie-Hellman key exchange using nacl.box.keyPair.fromSecretKey.
 */

// --- Group Key Management ---

export function generateGroupKey(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

/**
 * Derive an X25519 keypair from a Solana Ed25519 secret key.
 * TweetNaCl's box.keyPair.fromSecretKey takes the first 32 bytes of a
 * 64-byte Ed25519 secret key (the seed) and computes the X25519 keypair.
 */
export function deriveX25519KeyPair(ed25519SecretKey: Uint8Array): nacl.BoxKeyPair {
  // Solana Keypair.secretKey is 64 bytes: [seed(32) | pubkey(32)]
  // nacl.box.keyPair.fromSecretKey needs the 32-byte seed
  const seed = ed25519SecretKey.slice(0, 32);
  return nacl.box.keyPair.fromSecretKey(seed);
}

/**
 * Get the X25519 public key from a Solana Ed25519 secret key.
 */
export function getX25519PublicKey(ed25519SecretKey: Uint8Array): Uint8Array {
  return deriveX25519KeyPair(ed25519SecretKey).publicKey;
}

/**
 * Encrypt the group key for a specific member.
 * The room creator encrypts the group key using:
 *   - Their own X25519 secret key (derived from wallet)
 *   - The recipient's X25519 public key (derived from their wallet)
 *
 * Returns: nonce (24 bytes) + encrypted box
 */
export function encryptGroupKeyForMember(
  groupKey: Uint8Array,
  senderEd25519SecretKey: Uint8Array,
  recipientX25519PublicKey: Uint8Array,
): Uint8Array {
  const senderX25519 = deriveX25519KeyPair(senderEd25519SecretKey);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box(groupKey, nonce, recipientX25519PublicKey, senderX25519.secretKey);
  if (!encrypted) {
    throw new Error("Encryption failed");
  }
  // Prepend nonce to ciphertext for storage
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return result;
}

/**
 * Decrypt a group key that was encrypted for this member.
 */
export function decryptGroupKey(
  encryptedGroupKey: Uint8Array,
  recipientEd25519SecretKey: Uint8Array,
  senderX25519PublicKey: Uint8Array,
): Uint8Array {
  const recipientX25519 = deriveX25519KeyPair(recipientEd25519SecretKey);
  const nonce = encryptedGroupKey.slice(0, nacl.box.nonceLength);
  const ciphertext = encryptedGroupKey.slice(nacl.box.nonceLength);
  const decrypted = nacl.box.open(ciphertext, nonce, senderX25519PublicKey, recipientX25519.secretKey);
  if (!decrypted) {
    throw new Error("Decryption failed — wrong key or corrupted data");
  }
  return decrypted;
}

// --- Message Encryption ---

/**
 * Encrypt a plaintext message using the group's symmetric key.
 * Returns: nonce (24 bytes) + ciphertext
 */
export function encryptMessage(groupKey: Uint8Array, plaintext: string): Uint8Array {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = new TextEncoder().encode(plaintext);
  const encrypted = nacl.secretbox(messageBytes, nonce, groupKey);
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return result;
}

/**
 * Decrypt a ciphertext message using the group's symmetric key.
 * Expects input format: nonce (24 bytes) + ciphertext
 */
export function decryptMessage(groupKey: Uint8Array, ciphertext: Uint8Array): string {
  const nonce = ciphertext.slice(0, nacl.secretbox.nonceLength);
  const encrypted = ciphertext.slice(nacl.secretbox.nonceLength);
  const decrypted = nacl.secretbox.open(encrypted, nonce, groupKey);
  if (!decrypted) {
    throw new Error("Message decryption failed — wrong group key or corrupted data");
  }
  return new TextDecoder().decode(decrypted);
}

// --- Vote Commitment Helpers ---

/**
 * Create a vote commitment: sha256(vote_choice || nonce)
 * Returns { commitment, nonce } — store nonce locally, send commitment on-chain.
 */
export async function createVoteCommitment(
  voteChoice: 0 | 1,
): Promise<{ commitment: Uint8Array; nonce: Uint8Array }> {
  const nonce = nacl.randomBytes(32);
  const data = new Uint8Array(33);
  data[0] = voteChoice;
  data.set(nonce, 1);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return {
    commitment: new Uint8Array(hashBuffer),
    nonce,
  };
}

// --- Key Rotation ---

/**
 * Re-encrypt the group key for all existing members when a new member joins.
 * The room authority generates a new group key, encrypts it for each member,
 * and returns a map of member pubkey -> encrypted group key.
 *
 * Each member's encrypted key should be updated on-chain via update_member_key.
 */
export function rotateGroupKey(
  authorityEd25519SecretKey: Uint8Array,
  memberX25519PublicKeys: Map<string, Uint8Array>,
): { newGroupKey: Uint8Array; encryptedKeys: Map<string, Uint8Array> } {
  const newGroupKey = generateGroupKey();
  const encryptedKeys = new Map<string, Uint8Array>();

  for (const [memberPubkey, x25519Pubkey] of memberX25519PublicKeys) {
    const encrypted = encryptGroupKeyForMember(
      newGroupKey,
      authorityEd25519SecretKey,
      x25519Pubkey,
    );
    encryptedKeys.set(memberPubkey, encrypted);
  }

  return { newGroupKey, encryptedKeys };
}

// --- Convenience: Full Room Setup Flow ---

/**
 * Complete flow for a room creator:
 * 1. Generate group key
 * 2. Encrypt it for themselves
 * 3. Return both for storage
 */
export function initializeRoomEncryption(
  creatorEd25519SecretKey: Uint8Array,
): { groupKey: Uint8Array; encryptedGroupKey: Uint8Array; creatorX25519PublicKey: Uint8Array } {
  const groupKey = generateGroupKey();
  const creatorX25519 = deriveX25519KeyPair(creatorEd25519SecretKey);
  const encryptedGroupKey = encryptGroupKeyForMember(
    groupKey,
    creatorEd25519SecretKey,
    creatorX25519.publicKey,
  );
  return { groupKey, encryptedGroupKey, creatorX25519PublicKey: creatorX25519.publicKey };
}

/**
 * Flow for a new member joining:
 * The room authority encrypts the group key for the new member.
 */
export function encryptGroupKeyForNewMember(
  groupKey: Uint8Array,
  authorityEd25519SecretKey: Uint8Array,
  newMemberX25519PublicKey: Uint8Array,
): Uint8Array {
  return encryptGroupKeyForMember(groupKey, authorityEd25519SecretKey, newMemberX25519PublicKey);
}
