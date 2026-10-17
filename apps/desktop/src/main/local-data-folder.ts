import { APP_NAME } from "@newcord/shared";

/**
 * The folder, inside the per-user application data folder, that holds this copy's local data:
 * development runs talk to a local server and never share the installed app's session (D95).
 * @example localDataFolderName(true) // "newcord"
 */
export function localDataFolderName(isPackaged: boolean): string {
  return isPackaged ? APP_NAME : `${APP_NAME}-dev`;
}
