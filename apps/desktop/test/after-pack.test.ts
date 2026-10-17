import { join } from "node:path";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { beforeEach, describe, expect, it, vi } from "vitest";
import afterPack, { APP_FUSES } from "../build-hooks/after-pack.mjs";

const { flipFuses } = vi.hoisted(() => ({
  flipFuses: vi.fn((): Promise<number> => Promise.resolve(1)),
}));

vi.mock("@electron/fuses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@electron/fuses")>()),
  flipFuses,
}));

function contextFor(
  electronPlatformName: string,
): Parameters<typeof afterPack>[0] {
  return {
    appOutDir: join("dist", "win-unpacked"),
    electronPlatformName,
    packager: { appInfo: { productFilename: "newcord" } },
  };
}

beforeEach(() => {
  flipFuses.mockClear();
});

describe("the afterPack hook (#13, Step 01)", () => {
  it("switches off the fuses the app does not need in the packaged binary", async () => {
    await afterPack(contextFor("win32"));

    expect(flipFuses).toHaveBeenCalledWith(
      join("dist", "win-unpacked", "newcord.exe"),
      APP_FUSES,
    );
    expect(APP_FUSES).toEqual({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
  });

  it("fails a build for another platform instead of shipping it unflipped (D73)", async () => {
    await expect(afterPack(contextFor("linux"))).rejects.toThrow(
      /Only Windows/,
    );
    expect(flipFuses).not.toHaveBeenCalled();
  });
});
