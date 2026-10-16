import { Type, type Static } from "typebox";

/** Relay passwords are valid for 1 hour (10-m3-build Settings). */
export const RELAY_CREDENTIAL_LIFETIME_SECONDS = 3600;

/** A STUN or TURN address of the app's own relay (D23), as WebRTC's `iceServers` takes it. */
export const RelayUrl = Type.String({
  pattern: "^(stun|turn|turns):[^\\s,]+$",
});

/**
 * The `200` body of `GET /relay/credentials`: coturn's shared-secret format, where the username is
 * `<expiry unix time>:<deviceId>` and the password the base64 HMAC-SHA1 of it (10-m3-build step 2).
 */
export const RelayCredentialsResponse = Type.Object(
  {
    urls: Type.Array(RelayUrl, { minItems: 1 }),
    username: Type.String({ pattern: "^[0-9]+:[A-Za-z0-9_-]{22}$" }),
    password: Type.String({ minLength: 1 }),
    lifetimeSeconds: Type.Literal(RELAY_CREDENTIAL_LIFETIME_SECONDS),
  },
  { additionalProperties: false },
);
export type RelayCredentialsResponse = Static<typeof RelayCredentialsResponse>;
