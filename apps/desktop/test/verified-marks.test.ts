import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createVerifiedMarks,
  type VerifiedMarks,
} from "../src/main/local-store/verified-marks";

const number = "1".repeat(60);
let marks: VerifiedMarks;

beforeEach(() => {
  marks = createVerifiedMarks(new Database(":memory:"));
});

describe("verified marks", () => {
  it("keep the Safety number a person was verified for", () => {
    marks.mark("bruno", number);

    expect(marks.numberOf("bruno")).toBe(number);
    expect(marks.numberOf("carla")).toBeUndefined();
  });

  it("replace an older mark and can be cleared", () => {
    marks.mark("bruno", number);
    marks.mark("bruno", "2".repeat(60));
    expect(marks.numberOf("bruno")).toBe("2".repeat(60));

    marks.clear("bruno");

    expect(marks.numberOf("bruno")).toBeUndefined();
  });
});
