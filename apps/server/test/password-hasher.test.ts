import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { createArgon2idHasher } from "../src/accounts/password-hasher.js";
import { describeArgon2Hash } from "./support/server-test-kit.js";

const hasher = createArgon2idHasher();
const SECRET = "correct horse battery staple";

describe("createArgon2idHasher", () => {
  it("hashes with Argon2id, 19 MiB of memory, 2 iterations and 1 thread", async () => {
    const hash = await hasher.hash(SECRET);

    expect(describeArgon2Hash(hash)).toEqual({
      algorithm: "argon2id",
      cost: { m: 19 * 1024, t: 2, p: 1 },
    });
  });

  it("produces a hash that verifies the secret and refuses another", async () => {
    const hash = await hasher.hash(SECRET);

    expect(await argon2.verify(hash, SECRET)).toBe(true);
    expect(await argon2.verify(hash, `${SECRET}!`)).toBe(false);
  });

  it("salts every hash, so the same secret hashes differently", async () => {
    const [first, second] = await Promise.all([
      hasher.hash(SECRET),
      hasher.hash(SECRET),
    ]);

    expect(first).not.toBe(second);
  });

  it("does not contain the secret", async () => {
    expect(await hasher.hash(SECRET)).not.toContain(SECRET);
  });
});
