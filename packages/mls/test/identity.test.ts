import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describeKeyPackage, MlsDevice } from "../pkg/newcord_mls.js";

const DEVICE_ID = "mJMEbgts33NWbvGmNqkuEw";

/** An Ed25519 key pair as the desktop app makes it (M1): the raw seed and the raw public key. */
function nodeKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const jwk = generateKeyPairSync("ed25519").privateKey.export({
    format: "jwk",
  });
  return {
    privateKey: Buffer.from(jwk.d ?? "", "base64url"),
    publicKey: Buffer.from(jwk.x ?? "", "base64url"),
  };
}

function deviceWithIdentity(username = "alice"): {
  device: MlsDevice;
  publicKey: Uint8Array;
} {
  const { privateKey, publicKey } = nodeKeyPair();
  const device = new MlsDevice();
  device.initIdentity(privateKey, publicKey, username, DEVICE_ID);
  return { device, publicKey };
}

describe("initIdentity (#4, Step 02)", () => {
  it("signs with the Node.js Ed25519 key, under the credential <username>:<deviceId> (D70)", () => {
    const { device, publicKey } = deviceWithIdentity();

    expect(device.signaturePublicKey()).toEqual(new Uint8Array(publicKey));
    expect(device.identity()).toBe(`alice:${DEVICE_ID}`);
  });

  it("refuses a public key of another private key", () => {
    const { privateKey } = nodeKeyPair();
    const { publicKey } = nodeKeyPair();

    expect(() => {
      new MlsDevice().initIdentity(privateKey, publicKey, "alice", DEVICE_ID);
    }).toThrow(/does not belong to the private key/);
  });

  it("refuses a malformed username or Device ID", () => {
    const { privateKey, publicKey } = nodeKeyPair();

    expect(() => {
      new MlsDevice().initIdentity(privateKey, publicKey, "Alice", DEVICE_ID);
    }).toThrow(/not a username/);
    expect(() => {
      new MlsDevice().initIdentity(privateKey, publicKey, "alice", "x:y");
    }).toThrow(/not a Device ID/);
  });
});

describe("createKeyPackages", () => {
  it("returns n Key packages for cipher suite 1, the last one last-resort when asked", () => {
    const { device, publicKey } = deviceWithIdentity();

    const facts = device.createKeyPackages(4, true).map(describeKeyPackage);

    expect(facts).toHaveLength(4);
    expect(facts.map((fact) => fact.lastResort)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    for (const fact of facts) {
      expect(fact.ciphersuite).toBe(1);
      expect(fact.identity).toBe(`alice:${DEVICE_ID}`);
      expect(fact.signatureKey).toEqual(new Uint8Array(publicKey));
    }
  });

  it("makes Key packages that outlive the 30 days a Device may wait (D24)", () => {
    const { device } = deviceWithIdentity();

    const [facts] = device.createKeyPackages(1, false).map(describeKeyPackage);

    expect(facts?.lifetimeSeconds).toBeGreaterThanOrEqual(30 * 24 * 60 * 60);
  });

  it("fails clearly before the Device has an identity", () => {
    expect(() => new MlsDevice().createKeyPackages(1, false)).toThrow(
      /no MLS identity yet/,
    );
    expect(() => new MlsDevice().saveState()).toThrow(/no MLS identity yet/);
  });
});

describe("the state blob (D39)", () => {
  it("restores a working Device in a fresh instance, without initIdentity", () => {
    const { device, publicKey } = deviceWithIdentity();
    const blob = device.saveState();

    const restored = new MlsDevice();
    restored.loadState(blob);

    const [facts] = restored
      .createKeyPackages(1, false)
      .map(describeKeyPackage);
    expect(restored.identity()).toBe(`alice:${DEVICE_ID}`);
    expect(facts?.identity).toBe(`alice:${DEVICE_ID}`);
    expect(facts?.signatureKey).toEqual(new Uint8Array(publicKey));
  });

  it("refuses bytes that are not a state blob", () => {
    expect(() => {
      new MlsDevice().loadState(new Uint8Array([1, 2, 3]));
    }).toThrow(/not an MLS state blob/);
  });
});
