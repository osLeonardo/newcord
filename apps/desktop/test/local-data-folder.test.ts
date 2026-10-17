import { describe, expect, it } from "vitest";
import { localDataFolderName } from "../src/main/local-data-folder";

describe("the local data folder (D95)", () => {
  it("is newcord for the installed app and newcord-dev for development runs", () => {
    expect(localDataFolderName(true)).toBe("newcord");
    expect(localDataFolderName(false)).toBe("newcord-dev");
  });
});
