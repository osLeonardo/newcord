import type { RefreshTokenStore } from "./refresh-token-store.js";

/** Told when a Device's session ends, so its live connections can be closed (Step 03). */
export type DeviceSessionEndedListener = (deviceId: string) => void;

/** Logs a Device out: at its own request, or when one of its used refresh tokens comes back (D62). */
export type DeviceLogout = (deviceId: string) => void;

export interface DeviceLogoutDependencies {
  refreshTokenStore: Pick<RefreshTokenStore, "deleteForDevice">;
  onDeviceSessionEnded: DeviceSessionEndedListener;
}

/**
 * Creates the Device logout: deletes every refresh token of the Device, then tells the listener.
 * Example: `createDeviceLogout({ refreshTokenStore, onDeviceSessionEnded })(deviceId);`
 */
export function createDeviceLogout(
  dependencies: DeviceLogoutDependencies,
): DeviceLogout {
  return (deviceId: string): void => {
    dependencies.refreshTokenStore.deleteForDevice(deviceId);
    dependencies.onDeviceSessionEnded(deviceId);
  };
}
