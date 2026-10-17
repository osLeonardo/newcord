import type {
  CancelTimer,
  SessionClock,
} from "../../src/main/session/session-clock";

interface ManualTimer {
  readonly dueAt: number;
  readonly callback: () => void;
}

/** A session clock whose time moves only when a test advances it. */
export interface ManualClock extends SessionClock {
  /** Moves time forward, running each timer that comes due in order and letting its promises settle. */
  advance(milliseconds: number): Promise<void>;
  /** How long until each pending timer runs, soonest first. */
  pendingDelays(): number[];
}

/** Lets every promise already resolved, and the ones they chain, run their callbacks. */
export function settlePromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A manual clock starting at `startAt` (the real time by default, so JWT expiries make sense). */
export function createManualClock(startAt = Date.now()): ManualClock {
  let now = startAt;
  const timers = new Set<ManualTimer>();
  const nextDueBy = (deadline: number): ManualTimer | undefined =>
    [...timers]
      .filter((timer) => timer.dueAt <= deadline)
      .sort((first, second) => first.dueAt - second.dueAt)[0];
  return {
    now: (): number => now,
    setTimer: (callback, delayMs): CancelTimer => {
      const timer: ManualTimer = { dueAt: now + delayMs, callback };
      timers.add(timer);
      return (): void => {
        timers.delete(timer);
      };
    },
    advance: async (milliseconds): Promise<void> => {
      const deadline = now + milliseconds;
      await settlePromises();
      for (
        let timer = nextDueBy(deadline);
        timer;
        timer = nextDueBy(deadline)
      ) {
        timers.delete(timer);
        now = timer.dueAt;
        timer.callback();
        await settlePromises();
      }
      now = deadline;
    },
    pendingDelays: (): number[] =>
      [...timers].map((timer) => timer.dueAt - now).sort((a, b) => a - b),
  };
}
