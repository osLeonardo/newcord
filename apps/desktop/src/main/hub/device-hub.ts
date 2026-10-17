import type { HubEnvelope } from "../session/live-session";
import {
  openAccountHub,
  type AccountHub,
  type AccountHubDependencies,
} from "./account-hub";

/** Keeps one Account hub for whichever Account this installation belongs to when it connects. */
export interface DeviceHub {
  envelopeReceived(envelope: HubEnvelope): void;
  connectionChanged(ready: boolean): void;
  /** Presence changed; Call Participants of Accounts gone offline are dropped. */
  onlineAccountsChanged(usernames: readonly string[]): void;
  /** The current Account's hub, once a connection was accepted. */
  current(): AccountHub | undefined;
}

/**
 * Creates the Device's hub. Each accepted connection checks the stored Account, so after a switch
 * (D60) a fresh hub, with a fresh MLS identity, replaces the old one.
 * @example const deviceHub = createDeviceHub(dependencies); // wired to the live session's events
 */
export function createDeviceHub(
  dependencies: AccountHubDependencies,
): DeviceHub {
  let hub: AccountHub | undefined;
  const ensureHub = (): AccountHub | undefined => {
    const deviceId = dependencies.store.readAccount()?.deviceId;
    if (hub === undefined || hub.deviceId !== deviceId) {
      hub = openAccountHub(dependencies);
    }
    return hub;
  };
  return {
    envelopeReceived: (envelope): void => {
      hub?.envelopeReceived(envelope);
    },
    connectionChanged: (ready): void => {
      const current = ready ? ensureHub() : hub;
      current?.connectionChanged(ready);
    },
    onlineAccountsChanged: (usernames): void => {
      hub?.calls.onlineAccountsChanged(usernames);
    },
    current: (): AccountHub | undefined => hub,
  };
}
