/** What Electron tells a permission request handler; only media requests carry `mediaTypes`. */
export interface PermissionRequestDetails {
  readonly requestingUrl: string;
  readonly mediaTypes?: readonly string[];
}

/** The web contents asking, or null for a check made with no page. */
export interface PermissionAsker {
  readonly id: number;
}

export type PermissionRequestHandler = (
  webContents: PermissionAsker,
  permission: string,
  decide: (granted: boolean) => void,
  details: PermissionRequestDetails,
) => void;

export type PermissionCheckHandler = (
  webContents: PermissionAsker | null,
  permission: string,
) => boolean;

export interface PermissionControlledSession {
  setPermissionRequestHandler(handler: PermissionRequestHandler): void;
  setPermissionCheckHandler(handler: PermissionCheckHandler): void;
  setDevicePermissionHandler(handler: () => boolean): void;
}

/**
 * Grants the app's own windows the microphone and screen capture for Calls, and refuses every other
 * permission, request and check (security checklist, M3). A camera is never granted (D10).
 * @example grantCallPermissionsOnly(session.defaultSession, (id) => appWebContentsIds.has(id))
 */
export function grantCallPermissionsOnly(
  session: PermissionControlledSession,
  isAppWebContents: (webContentsId: number) => boolean,
): void {
  session.setPermissionRequestHandler(
    (webContents, permission, decide, details) => {
      decide(
        isAppWebContents(webContents.id) &&
          isCallPermission(permission, details),
      );
    },
  );
  session.setPermissionCheckHandler(
    (webContents, permission) =>
      webContents !== null &&
      isAppWebContents(webContents.id) &&
      permission === "media",
  );
  session.setDevicePermissionHandler(() => false);
}

/**
 * The microphone alone, or a screen capture; a media request naming the camera is refused whole.
 * Electron 44 asks for a screen capture as "media" with an empty `mediaTypes`, and the display-media
 * handler then answers only with the source picked in the app's own picker (10-m3-build step 7).
 */
function isCallPermission(
  permission: string,
  details: PermissionRequestDetails,
): boolean {
  if (permission === "display-capture") return true;
  if (permission !== "media" || details.mediaTypes === undefined) return false;
  return details.mediaTypes.every((type) => type === "audio");
}
