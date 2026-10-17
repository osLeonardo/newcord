import type { CpuMeasurement } from "../../preload/call-api";

/** One process's CPU use since the previous reading, as `app.getAppMetrics()` gives it. */
export interface ProcessCpu {
  readonly type: string;
  readonly percentCpu: number;
}

const SAMPLE_INTERVAL_MS = 1000;

/**
 * Measures the app's CPU use once a second for a while, for the codec comparison of #9, Step 05
 * (10-m3-build step 9). The first reading only starts Electron's counters.
 * @example await measureCpu(() => metricsNow(), 30, (ms) => setTimeout(ms))
 */
export async function measureCpu(
  read: () => readonly ProcessCpu[],
  seconds: number,
  wait: (milliseconds: number) => Promise<void>,
): Promise<CpuMeasurement> {
  read();
  const samples: (readonly ProcessCpu[])[] = [];
  for (let second = 0; second < seconds; second++) {
    await wait(SAMPLE_INTERVAL_MS);
    samples.push(read());
  }
  return summarizeCpu(samples, seconds);
}

/**
 * The average CPU use of the whole app and of each process type, in percent of one core.
 * @example summarizeCpu([[{ type: "GPU", percentCpu: 10 }]], 1) // { seconds: 1, averagePercent: 10, … }
 */
export function summarizeCpu(
  samples: readonly (readonly ProcessCpu[])[],
  seconds: number,
): CpuMeasurement {
  const totals = new Map<string, number>();
  for (const sample of samples) {
    for (const process of sample) {
      totals.set(
        process.type,
        (totals.get(process.type) ?? 0) + process.percentCpu,
      );
    }
  }
  const count = Math.max(samples.length, 1);
  const byProcessType = [...totals]
    .map(([type, total]) => ({ type, averagePercent: round(total / count) }))
    .sort((first, second) => second.averagePercent - first.averagePercent);
  const sum = [...totals.values()].reduce((all, total) => all + total, 0);
  return { seconds, averagePercent: round(sum / count), byProcessType };
}

function round(percent: number): number {
  return Math.round(percent * 10) / 10;
}
