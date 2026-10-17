import { describe, expect, it } from "vitest";
import { safetyNumberBlocks } from "../src/renderer/src/groups/safety-text";

describe("safetyNumberBlocks", () => {
  it("shows 60 digits as 12 blocks of 5", () => {
    const number = "0123456789".repeat(6);

    const blocks = safetyNumberBlocks(number);

    expect(blocks).toHaveLength(12);
    expect(blocks[0]).toBe("01234");
    expect(blocks.join("")).toBe(number);
  });
});
