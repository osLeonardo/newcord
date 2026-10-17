import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { IdentityKey } from "@newcord/shared";
import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import {
  createIdentityKeyPair,
  identityKeyBase64,
  loadOrCreateIdentityKey,
  type IdentityKeyPair,
  type IdentityKeyStore,
} from "../src/main/identity/identity-key";

// The fixed DER header of an Ed25519 private key in PKCS#8 (RFC 8410), followed by the 32-byte seed.
const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);
const message = Buffer.from("a message signed with the identity key");

function privateKeyFromRawBytes(
  rawPrivateKey: Buffer,
): ReturnType<typeof createPrivateKey> {
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, rawPrivateKey]),
    format: "der",
    type: "pkcs8",
  });
}

function publicKeyFromRawBytes(
  rawPublicKey: Buffer,
): ReturnType<typeof createPublicKey> {
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: rawPublicKey.toString("base64url") },
    format: "jwk",
  });
}

class FakeIdentityKeyStore implements IdentityKeyStore {
  storedKeyPair: IdentityKeyPair | undefined;

  readIdentityKey(): IdentityKeyPair | undefined {
    return this.storedKeyPair;
  }

  saveIdentityKey(keyPair: IdentityKeyPair): void {
    this.storedKeyPair = keyPair;
  }
}

describe("createIdentityKeyPair", () => {
  it("creates the raw 32-byte public and private keys of an Ed25519 pair", () => {
    const keyPair = createIdentityKeyPair();

    expect(keyPair.publicKey).toHaveLength(32);
    expect(keyPair.privateKey).toHaveLength(32);
  });

  it("creates a new pair each time", () => {
    const first = createIdentityKeyPair();
    const second = createIdentityKeyPair();

    expect(first.publicKey.equals(second.publicKey)).toBe(false);
    expect(first.privateKey.equals(second.privateKey)).toBe(false);
  });

  it("keeps private bytes that rebuild the key, which derives the same public key", () => {
    const keyPair = createIdentityKeyPair();
    const derivedPublicKey = createPublicKey(
      privateKeyFromRawBytes(keyPair.privateKey),
    ).export({ format: "jwk" });

    expect(derivedPublicKey.x).toBe(keyPair.publicKey.toString("base64url"));
  });

  it("keeps bytes that sign and verify as one Ed25519 pair", () => {
    const keyPair = createIdentityKeyPair();
    const signature = sign(
      null,
      message,
      privateKeyFromRawBytes(keyPair.privateKey),
    );

    expect(
      verify(
        null,
        message,
        publicKeyFromRawBytes(keyPair.publicKey),
        signature,
      ),
    ).toBe(true);
  });
});

describe("identityKeyBase64", () => {
  it("is the raw public key in the padded base64 the server accepts", () => {
    const identityKey = identityKeyBase64(createIdentityKeyPair());

    expect(Value.Check(IdentityKey, identityKey)).toBe(true);
    expect(Buffer.from(identityKey, "base64")).toHaveLength(32);
  });

  it("is the key itself, not Node's default SPKI export", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const spki = publicKey.export({ format: "der", type: "spki" });
    const rawPublicKey = spki.subarray(-32);

    expect(
      identityKeyBase64({
        publicKey: rawPublicKey,
        privateKey: Buffer.alloc(32),
      }),
    ).toBe(rawPublicKey.toString("base64"));
    expect(spki).toHaveLength(44);
  });
});

describe("loadOrCreateIdentityKey", () => {
  it("creates and stores a key pair on first start", () => {
    const store = new FakeIdentityKeyStore();

    const keyPair = loadOrCreateIdentityKey(store, createIdentityKeyPair);

    expect(store.storedKeyPair).toBe(keyPair);
  });

  it("reuses the stored key pair on later starts", () => {
    const store = new FakeIdentityKeyStore();
    const storedKeyPair = createIdentityKeyPair();
    store.saveIdentityKey(storedKeyPair);
    const createKeyPair = vi.fn(createIdentityKeyPair);

    expect(loadOrCreateIdentityKey(store, createKeyPair)).toBe(storedKeyPair);
    expect(createKeyPair).not.toHaveBeenCalled();
  });
});
