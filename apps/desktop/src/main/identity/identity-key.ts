import { generateKeyPairSync } from "node:crypto";

/** A Device's Ed25519 identity key pair as raw bytes: 32 for the public key, 32 for the private seed. */
export interface IdentityKeyPair {
  readonly publicKey: Buffer;
  readonly privateKey: Buffer;
}

/** Where the identity key pair is kept between starts. */
export interface IdentityKeyStore {
  readIdentityKey(): IdentityKeyPair | undefined;
  saveIdentityKey(keyPair: IdentityKeyPair): void;
}

/**
 * Creates a new Ed25519 identity key pair, keeping the raw bytes OpenMLS rebuilds its credential from in M2.
 * @example const keyPair = createIdentityKeyPair(); keyPair.publicKey.length // 32
 */
export function createIdentityKeyPair(): IdentityKeyPair {
  // The JWK form holds the raw key bytes directly: "x" is the public key and "d" the private seed.
  const { x, d } = generateKeyPairSync("ed25519").privateKey.export({
    format: "jwk",
  });
  return {
    publicKey: rawKeyBytes(x, "x"),
    privateKey: rawKeyBytes(d, "d"),
  };
}

/**
 * The public identity key as the server accepts it: the raw 32 bytes in padded standard base64 (D59).
 * @example identityKeyBase64(keyPair) // "q83vEjRWeJA...AAAA="
 */
export function identityKeyBase64(keyPair: IdentityKeyPair): string {
  return keyPair.publicKey.toString("base64");
}

/**
 * Returns the stored identity key pair, creating and storing one on first start.
 * @example const keyPair = loadOrCreateIdentityKey(localStore, createIdentityKeyPair);
 */
export function loadOrCreateIdentityKey(
  store: IdentityKeyStore,
  createKeyPair: () => IdentityKeyPair,
): IdentityKeyPair {
  const storedKeyPair = store.readIdentityKey();
  if (storedKeyPair !== undefined) return storedKeyPair;
  const keyPair = createKeyPair();
  store.saveIdentityKey(keyPair);
  return keyPair;
}

function rawKeyBytes(jwkField: string | undefined, fieldName: string): Buffer {
  if (jwkField === undefined) {
    throw new Error(
      `The Ed25519 key's JWK export has no "${fieldName}" field; expected its raw bytes in base64url`,
    );
  }
  return Buffer.from(jwkField, "base64url");
}
