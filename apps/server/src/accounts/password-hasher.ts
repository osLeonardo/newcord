import argon2 from "argon2";

/** Argon2id cost: 19 MiB of memory (in KiB), 2 iterations, 1 thread (D35, 08-m1-build Settings). */
export const ARGON2ID_COST = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

/**
 * An Argon2id hash with the same cost as real ones, of 32 random bytes nobody kept. Checking a
 * password against it takes as long as a real check, so the answer to an unknown username
 * arrives no sooner than the answer to a wrong password.
 */
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$+UYOworn7GIlJRvVg6HD7Q$XtUyymY+Kwi1gumzu1ecouzNZpxKk5ksq3zyWniXclw";

/** Hashes passwords and Recovery codes, so only their hashes are stored, and checks them later. */
export interface PasswordHasher {
  hash(secret: string): Promise<string>;
  verify(hash: string, secret: string): Promise<boolean>;
}

/**
 * Creates the Argon2id hasher with the cost from the Settings.
 * Example: `const passwordHash = await createArgon2idHasher().hash(password);`
 */
export function createArgon2idHasher(): PasswordHasher {
  return {
    hash: (secret: string): Promise<string> =>
      argon2.hash(secret, { type: argon2.argon2id, ...ARGON2ID_COST }),
    verify: (hash: string, secret: string): Promise<boolean> =>
      argon2.verify(hash, secret),
  };
}
