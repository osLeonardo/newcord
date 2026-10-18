import { APP_NAME } from "@newcord/shared";

/** A second development copy's number, from 2 to 9, as `NEWCORD_DEV_PROFILE` gives it (D95). */
const DEV_PROFILE = /^[2-9]$/;

/**
 * The folder, inside the per-user application data folder, that holds this copy's local data:
 * development runs talk to a local server and never share the installed app's session (D95).
 * A development run given a profile from 2 to 9 gets a folder of its own, and with it its own
 * single-instance lock, so two Accounts can run side by side on one computer; the installed app
 * ignores the profile.
 * @example localDataFolderName(false, "2") // "newcord-dev-2"
 */
export function localDataFolderName(
  isPackaged: boolean,
  devProfile?: string,
): string {
  if (isPackaged) return APP_NAME;
  return devProfile !== undefined && DEV_PROFILE.test(devProfile)
    ? `${APP_NAME}-dev-${devProfile}`
    : `${APP_NAME}-dev`;
}
