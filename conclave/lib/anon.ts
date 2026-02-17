/**
 * Anonymous identity helpers for Conclave.
 *
 * Derives deterministic anonymous aliases from wallet addresses within a room.
 * The same wallet always gets the same alias in a given room, but different
 * aliases across rooms — so identities can't be linked across rooms.
 */

const ANON_ADJECTIVES = [
  "Swift", "Silent", "Hidden", "Shadow", "Veiled",
  "Masked", "Ghost", "Cipher", "Stealth", "Phantom",
  "Mystic", "Obscure", "Secret", "Covert", "Enigma",
  "Arcane", "Nebula", "Rogue", "Onyx", "Void",
];

const ANON_NOUNS = [
  "Fox", "Owl", "Wolf", "Hawk", "Lynx",
  "Bear", "Crow", "Viper", "Eagle", "Raven",
  "Panther", "Falcon", "Tiger", "Heron", "Cobra",
  "Sphinx", "Dragon", "Phoenix", "Jaguar", "Mantis",
];

/** Simple hash of a string to a number */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Get an anonymous alias for a wallet in a specific room.
 * Returns something like "Silent Owl" or "Phantom Viper".
 */
export function getAnonAlias(walletAddress: string, roomAddress: string): string {
  const seed = simpleHash(walletAddress + ":" + roomAddress);
  const adj = ANON_ADJECTIVES[seed % ANON_ADJECTIVES.length];
  const noun = ANON_NOUNS[Math.floor(seed / ANON_ADJECTIVES.length) % ANON_NOUNS.length];
  return `${adj} ${noun}`;
}

/**
 * Build a lookup map from wallet addresses to anonymous aliases for a room.
 * Ensures no two members share the same alias (appends suffix if collision).
 */
export function buildAnonMap(wallets: string[], roomAddress: string): Map<string, string> {
  const map = new Map<string, string>();
  const usedAliases = new Set<string>();

  for (const wallet of wallets) {
    let alias = getAnonAlias(wallet, roomAddress);
    let suffix = 2;
    while (usedAliases.has(alias)) {
      alias = `${getAnonAlias(wallet, roomAddress)} ${suffix}`;
      suffix++;
    }
    usedAliases.add(alias);
    map.set(wallet, alias);
  }
  return map;
}
