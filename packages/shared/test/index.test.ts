import { describe, expect, it } from "vitest";
import { APP_NAME } from "../src/index.js";

describe("APP_NAME", () => {
  it('is "newcord" (D58, D92)', () => {
    expect(APP_NAME).toBe("newcord");
  });
});
