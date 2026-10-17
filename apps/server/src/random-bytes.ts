/** A source of random bytes, such as `crypto.randomBytes`; tests pass fixed bytes. */
export type RandomBytes = (size: number) => Buffer;
