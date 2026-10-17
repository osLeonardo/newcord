/** Cancels a timer; does nothing once it has run. */
export type CancelTimer = () => void;

/** The time and the timers the live session runs on, so tests can move time forward themselves. */
export interface SessionClock {
  now(): number;
  setTimer(callback: () => void, delayMs: number): CancelTimer;
}

/** The real clock and timers. */
export const systemSessionClock: SessionClock = {
  now: (): number => Date.now(),
  setTimer: (callback, delayMs): CancelTimer => {
    const timer = setTimeout(callback, delayMs);
    return (): void => {
      clearTimeout(timer);
    };
  },
};
