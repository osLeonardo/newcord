/** The first wait after a dropped connection (decided in #3's spec). */
export const FIRST_RETRY_DELAY_MS = 1000;
/** The longest wait between attempts (decided in #3's spec). */
export const LONGEST_RETRY_DELAY_MS = 30 * 1000;

/** Exponential backoff: 1, 2, 4… seconds up to 30, back to 1 second after `reset`. */
export interface RetryBackoff {
  /** The wait before the next attempt; each call doubles the following one. */
  nextDelayMs(): number;
  reset(): void;
}

/**
 * Creates the backoff the WebSocket reconnects and the token renewals retry with.
 * @example const backoff = createRetryBackoff(); backoff.nextDelayMs(); // 1000, then 2000, 4000…
 */
export function createRetryBackoff(): RetryBackoff {
  let nextDelay = FIRST_RETRY_DELAY_MS;
  return {
    nextDelayMs: (): number => {
      const delay = nextDelay;
      nextDelay = Math.min(nextDelay * 2, LONGEST_RETRY_DELAY_MS);
      return delay;
    },
    reset: (): void => {
      nextDelay = FIRST_RETRY_DELAY_MS;
    },
  };
}
