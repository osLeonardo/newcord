export type PermissionRequestHandler = (
  webContents: unknown,
  permission: string,
  decide: (granted: boolean) => void,
) => void;

export interface PermissionControlledSession {
  setPermissionRequestHandler(handler: PermissionRequestHandler): void;
  setPermissionCheckHandler(handler: () => boolean): void;
  setDevicePermissionHandler(handler: () => boolean): void;
}

/**
 * Refuses every permission request and check in the session; M1 needs none.
 * @example refuseEveryPermission(session.defaultSession)
 */
export function refuseEveryPermission(
  session: PermissionControlledSession,
): void {
  session.setPermissionRequestHandler((_webContents, _permission, decide) => {
    decide(false);
  });
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
}
