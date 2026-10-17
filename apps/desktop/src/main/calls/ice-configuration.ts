import type { RelayCredentialsResponse } from "@newcord/shared";
import type { IceConfiguration } from "../../preload/call-api";

/**
 * The connections' configuration from the relay's addresses and a fresh password: STUN and TURN
 * only on the app's own relay (10-m3-build step 5), relay-only with Hide my IP (D14).
 * @example iceConfigurationOf(relay, false) // { iceServers: [{ urls: ["stun:…"] }, …], iceTransportPolicy: "all" }
 */
export function iceConfigurationOf(
  relay: RelayCredentialsResponse,
  hideMyIp: boolean,
): IceConfiguration {
  const stun = relay.urls.filter((url) => url.startsWith("stun:"));
  const turn = relay.urls.filter((url) => !url.startsWith("stun:"));
  return {
    iceServers: [
      ...(stun.length === 0 ? [] : [{ urls: stun }]),
      ...(turn.length === 0
        ? []
        : [
            {
              urls: turn,
              username: relay.username,
              credential: relay.password,
            },
          ]),
    ],
    iceTransportPolicy: hideMyIp ? "relay" : "all",
  };
}

/** Without the relay, and without Hide my IP, Participants on the same network can still connect directly. */
export const DIRECT_ONLY_CONFIGURATION: IceConfiguration = {
  iceServers: [],
  iceTransportPolicy: "all",
};
