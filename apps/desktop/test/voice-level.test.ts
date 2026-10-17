import { describe, expect, it } from "vitest";
import {
  createLevelGate,
  rmsLevel,
  SPEAKING_HOLD_MS,
  SPEAKING_LEVEL,
} from "../src/renderer/src/calls/voice-level";

describe("rmsLevel", () => {
  it("measures loudness as the root mean square", () => {
    expect(rmsLevel([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
    expect(rmsLevel(new Float32Array(128))).toBe(0);
    expect(rmsLevel([])).toBe(0);
  });
});

describe("the level gate", () => {
  it("opens at the threshold", () => {
    const gate = createLevelGate();

    expect(gate.update(SPEAKING_LEVEL / 2, 0)).toBe(false);
    expect(gate.update(SPEAKING_LEVEL, 10)).toBe(true);
  });

  it("stays open for 300 ms after the level drops, then closes", () => {
    const gate = createLevelGate();
    gate.update(0.5, 1000);

    expect(gate.update(0, 1000 + SPEAKING_HOLD_MS)).toBe(true);
    expect(gate.update(0, 1001 + SPEAKING_HOLD_MS)).toBe(false);
  });

  it("restarts the hold whenever the level rises again", () => {
    const gate = createLevelGate();
    gate.update(0.5, 0);
    gate.update(0.5, 250);

    expect(gate.update(0, 500)).toBe(true);
    expect(gate.update(0, 551)).toBe(false);
  });
});
