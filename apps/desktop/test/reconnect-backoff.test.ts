import { describe, expect, it } from "vitest";
import { createRetryBackoff } from "../src/main/session/reconnect-backoff";

function nextDelays(count: number, backoff = createRetryBackoff()): number[] {
  return Array.from({ length: count }, () => backoff.nextDelayMs());
}

describe("createRetryBackoff", () => {
  it("doubles from 1 second up to 30 seconds", () => {
    expect(nextDelays(8)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });

  it("starts again from 1 second after a reset", () => {
    const backoff = createRetryBackoff();
    nextDelays(4, backoff);

    backoff.reset();

    expect(nextDelays(2, backoff)).toEqual([1000, 2000]);
  });
});
