import { describe, expect, it } from "vitest";
import { APP_NAME } from "../src/index.js";

describe("APP_NAME", () => {
  it('is the working title "newcord" (D58)', () => {
    expect(APP_NAME).toBe("newcord");
  });
});
