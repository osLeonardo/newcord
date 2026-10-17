import { describe, expect, it } from "vitest";
import { ciphersuite, moduleVersion } from "../pkg/newcord_mls.js";

describe("@newcord/mls (#4, Step 01)", () => {
  it("loads as a Node.js module and reports its version", () => {
    expect(moduleVersion()).toBe("0.1.0");
  });

  it("uses MLS cipher suite 1 (D38)", () => {
    expect(ciphersuite()).toBe(1);
  });
});
