import argon2 from "argon2";

/** Argon2id cost: 19 MiB of memory (in KiB), 2 iterations, 1 thread (D35, 08-m1-build Settings). */
export const ARGON2ID_COST = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

/** Hashes passwords and Recovery codes, so only their hashes are stored. */
export interface PasswordHasher {
  hash(secret: string): Promise<string>;
}

/**
 * Creates the Argon2id hasher with the cost from the Settings.
 * Example: `const passwordHash = await createArgon2idHasher().hash(password);`
 */
export function createArgon2idHasher(): PasswordHasher {
  return {
    hash: (secret: string): Promise<string> =>
      argon2.hash(secret, { type: argon2.argon2id, ...ARGON2ID_COST }),
  };
}
