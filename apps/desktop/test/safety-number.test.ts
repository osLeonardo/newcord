import { describe, expect, it } from "vitest";
import {
  safetyNumberHalf,
  safetyNumberOf,
  type PersonKeys,
} from "../src/main/safety/safety-number";

function key(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

const alice: PersonKeys = { username: "alice", deviceKeys: [key(1), key(2)] };
const bruno: PersonKeys = { username: "bruno", deviceKeys: [key(3)] };

function numberBetween(own: PersonKeys, their: PersonKeys): string {
  return safetyNumberOf(safetyNumberHalf(own), safetyNumberHalf(their));
}

describe("the Safety number (D45)", () => {
  it("has 60 digits", () => {
    expect(numberBetween(alice, bruno)).toMatch(/^\d{60}$/);
  });

  it("is the same computed from either side", () => {
    expect(numberBetween(alice, bruno)).toBe(numberBetween(bruno, alice));
  });

  it("does not depend on the order of a person's Device keys", () => {
    const reordered = { ...alice, deviceKeys: [key(2), key(1)] };

    expect(numberBetween(reordered, bruno)).toBe(numberBetween(alice, bruno));
  });

  it("changes when any Device key of either person changes", () => {
    const before = numberBetween(alice, bruno);

    expect(
      numberBetween({ ...alice, deviceKeys: [key(1), key(9)] }, bruno),
    ).not.toBe(before);
    expect(numberBetween(alice, { ...bruno, deviceKeys: [key(4)] })).not.toBe(
      before,
    );
  });

  it("changes when a Device is added or removed", () => {
    const before = numberBetween(alice, bruno);

    expect(
      numberBetween(alice, { ...bruno, deviceKeys: [key(3), key(5)] }),
    ).not.toBe(before);
    expect(numberBetween({ ...alice, deviceKeys: [key(1)] }, bruno)).not.toBe(
      before,
    );
  });

  it("depends on the username", () => {
    expect(numberBetween({ ...alice, username: "alicia" }, bruno)).not.toBe(
      numberBetween(alice, bruno),
    );
  });
});
