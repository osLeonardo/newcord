import { generateKeyPairSync, randomBytes } from "node:crypto";
import { MlsDevice, type IncomingMls } from "../../pkg/newcord_mls.js";

/** A Device with a fresh Node.js Ed25519 key, as the desktop app makes it (M1). */
export function deviceNamed(username: string): MlsDevice {
  const jwk = generateKeyPairSync("ed25519").privateKey.export({
    format: "jwk",
  });
  const device = new MlsDevice();
  device.initIdentity(
    Buffer.from(jwk.d ?? "", "base64url"),
    Buffer.from(jwk.x ?? "", "base64url"),
    username,
    randomBytes(16).toString("base64url"),
  );
  return device;
}

export function newGroupId(): Uint8Array {
  return new Uint8Array(randomBytes(16));
}

export function keyPackageOf(device: MlsDevice): Uint8Array {
  const [keyPackage] = device.createKeyPackages(1, false);
  if (keyPackage === undefined) throw new Error("no Key package");
  return keyPackage;
}

/** The creator starts the Group and adds the others, who join from the welcome alone. */
export function groupOf(creator: MlsDevice, others: MlsDevice[]): Uint8Array {
  const groupId = newGroupId();
  creator.createGroup(groupId);
  const own = creator.addMembers(groupId, others.map(keyPackageOf));
  creator.mergePendingCommit(groupId);
  for (const other of others) {
    if (own.welcome === undefined) throw new Error("no welcome");
    other.joinFromWelcome(own.welcome);
  }
  return groupId;
}

export function text(message: string): Uint8Array {
  return new TextEncoder().encode(message);
}

/** The plaintext and sender of a decrypted message; anything else fails the test. */
export function readText(
  device: MlsDevice,
  message: Uint8Array,
): { sender: string; text: string } {
  const incoming: IncomingMls = device.processIncoming(message);
  if (incoming.kind !== "message") throw new Error(`got a ${incoming.kind}`);
  return {
    sender: incoming.sender,
    text: new TextDecoder().decode(incoming.plaintext),
  };
}

/** MLS's wire format, after the protocol version: 2 is an encrypted (private) message. */
export function isEncrypted(message: Uint8Array): boolean {
  return message[2] === 0 && message[3] === 2;
}
