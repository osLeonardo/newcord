import { describe, expect, it } from "vitest";
import { createRequestRateLimit } from "../src/hub/request-rate-limit.js";

const ONE_HOUR = 60 * 60 * 1000;

function limitOf(max: number): {
  tryCount: (key: string) => boolean;
  advance: (milliseconds: number) => void;
} {
  let now = 0;
  const limit = createRequestRateLimit(
    { max, timeWindow: ONE_HOUR },
    () => now,
  );
  return {
    tryCount: (key): boolean => limit.tryCount(key),
    advance: (milliseconds): void => {
      now += milliseconds;
    },
  };
}

describe("createRequestRateLimit", () => {
  it("allows the setting's number of requests in a window, then refuses", () => {
    const limit = limitOf(3);

    expect([1, 2, 3, 4].map(() => limit.tryCount("alice"))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("counts each key separately", () => {
    const limit = limitOf(1);
    limit.tryCount("alice");

    expect(limit.tryCount("bruno")).toBe(true);
    expect(limit.tryCount("alice")).toBe(false);
  });

  it("starts a new window once the old one is over", () => {
    const limit = limitOf(1);
    limit.tryCount("alice");

    limit.advance(ONE_HOUR - 1);
    expect(limit.tryCount("alice")).toBe(false);
    limit.advance(1);
    expect(limit.tryCount("alice")).toBe(true);
  });
});
