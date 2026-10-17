import { describe, expect, it, vi } from "vitest";
import { measureCpu, summarizeCpu } from "../src/main/calls/cpu-measurement";

describe("summarizeCpu", () => {
  it("averages each process type and the whole app over the samples", () => {
    const summary = summarizeCpu(
      [
        [
          { type: "GPU", percentCpu: 10 },
          { type: "Tab", percentCpu: 20 },
          { type: "Tab", percentCpu: 5 },
        ],
        [
          { type: "GPU", percentCpu: 30 },
          { type: "Tab", percentCpu: 15 },
        ],
      ],
      2,
    );

    expect(summary).toEqual({
      seconds: 2,
      averagePercent: 40,
      byProcessType: [
        { type: "GPU", averagePercent: 20 },
        { type: "Tab", averagePercent: 20 },
      ],
    });
  });

  it("answers zero for no samples", () => {
    expect(summarizeCpu([], 0)).toEqual({
      seconds: 0,
      averagePercent: 0,
      byProcessType: [],
    });
  });
});

describe("measureCpu", () => {
  it("reads once to start the counters, then once a second", async () => {
    const read = vi
      .fn()
      .mockReturnValueOnce([{ type: "Browser", percentCpu: 99 }])
      .mockReturnValue([{ type: "Browser", percentCpu: 4 }]);
    const wait = vi.fn<(milliseconds: number) => Promise<void>>(() =>
      Promise.resolve(),
    );

    const measured = await measureCpu(read, 3, wait);

    expect(read).toHaveBeenCalledTimes(4);
    expect(wait.mock.calls).toEqual([[1000], [1000], [1000]]);
    expect(measured.averagePercent).toBe(4);
  });
});
