import { join } from "node:path";
import { flipFuses, FuseV1Options, FuseVersion } from "@electron/fuses";

/** The fuses of the packaged binary: the ones the app does not need are off (12-m5-build step 5). */
export const APP_FUSES = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

/**
 * electron-builder's afterPack hook: flips the fuses of the packaged Electron binary. Only Windows
 * is built in version 1 (D73), so any other platform fails the build instead of shipping unflipped.
 * @example afterPack: ./build-hooks/after-pack.mjs (electron-builder.yml)
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    throw new Error(
      `Only Windows builds are configured (D73), not ${context.electronPlatformName}`,
    );
  }
  const binary = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`,
  );
  await flipFuses(binary, APP_FUSES);
}
