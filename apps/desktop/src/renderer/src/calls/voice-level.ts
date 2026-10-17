/** The loudness, as the RMS of samples between -1 and 1, above which someone counts as speaking. */
export const SPEAKING_LEVEL = 0.02;

/** How long someone still counts as speaking after their level drops (#9's spec: 300 ms). */
export const SPEAKING_HOLD_MS = 300;

/**
 * The root mean square of audio samples between -1 and 1.
 * @example rmsLevel([0.5, -0.5]) // 0.5
 */
export function rmsLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of Array.from(samples)) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/** Decides from successive levels whether someone is speaking. */
export interface LevelGate {
  /** True while the level is above the threshold, and for the hold time after it drops. */
  update(level: number, now: number): boolean;
}

/**
 * Creates a gate that opens at the threshold and closes once the level stayed under it for the hold time.
 * @example const gate = createLevelGate(); gate.update(rmsLevel(samples), performance.now());
 */
export function createLevelGate(
  threshold = SPEAKING_LEVEL,
  holdMs = SPEAKING_HOLD_MS,
): LevelGate {
  let lastLoud: number | undefined;
  return {
    update: (level, now): boolean => {
      if (level >= threshold) lastLoud = now;
      return lastLoud !== undefined && now - lastLoud <= holdMs;
    },
  };
}
