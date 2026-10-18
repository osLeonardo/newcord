import { describe, expect, it } from "vitest";
import { localDataFolderName } from "../src/main/local-data-folder";

describe("the local data folder (D95)", () => {
  it("is newcord for the installed app and newcord-dev for development runs", () => {
    expect(localDataFolderName(true)).toBe("newcord");
    expect(localDataFolderName(false)).toBe("newcord-dev");
  });

  it("gives a second development copy a folder of its own", () => {
    expect(localDataFolderName(false, "2")).toBe("newcord-dev-2");
    expect(localDataFolderName(false, "9")).toBe("newcord-dev-9");
  });

  it("ignores a profile in the installed app", () => {
    expect(localDataFolderName(true, "2")).toBe("newcord");
  });

  it.each(["", "1", "10", "../desktop", "2 ", "x"])(
    "ignores the profile %j, which is not a number from 2 to 9",
    (profile) => {
      expect(localDataFolderName(false, profile)).toBe("newcord-dev");
    },
  );
});
