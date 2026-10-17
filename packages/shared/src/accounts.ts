import { Type, type Static } from "typebox";
import { RecoveryCode } from "./recovery-code.js";
import { AccessToken, RefreshToken } from "./sessions.js";

/** An Account's username: 3 to 32 lowercase letters, digits or underscores (08-m1-build Settings). */
export const Username = Type.String({
  minLength: 3,
  maxLength: 32,
  pattern: "^[a-z0-9_]+$",
});

/** A password: 12 to 256 characters (08-m1-build Settings). */
export const Password = Type.String({ minLength: 12, maxLength: 256 });

/** A Device's raw 32-byte Ed25519 public identity key, in padded base64 (D30, D59). */
export const IdentityKey = Type.String({
  // 32 bytes encode to 43 symbols plus one "="; the last symbol's two low
  // bits are unused, so only these 16 symbols are canonical there.
  pattern: "^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$",
});

/** A Device ID created by the server: 16 random bytes in base64url, so never a ":" (D70). */
export const DeviceId = Type.String({ pattern: "^[A-Za-z0-9_-]{22}$" });

/** The body of `POST /register`. */
export const RegisterRequest = Type.Object(
  { username: Username, password: Password, identityKey: IdentityKey },
  { additionalProperties: false },
);
export type RegisterRequest = Static<typeof RegisterRequest>;

/** The `201` body of `POST /register`; the Recovery code is shown once and never again (D55). */
export const RegisterResponse = Type.Object(
  {
    accessToken: AccessToken,
    refreshToken: RefreshToken,
    deviceId: DeviceId,
    recoveryCode: RecoveryCode,
  },
  { additionalProperties: false },
);
export type RegisterResponse = Static<typeof RegisterResponse>;

/** The body of `POST /login`: the identity key finds this Device or adds it to the Account (D59, D60). */
export const LoginRequest = Type.Object(
  { username: Username, password: Password, identityKey: IdentityKey },
  { additionalProperties: false },
);
export type LoginRequest = Static<typeof LoginRequest>;

/** The `200` body of `POST /login`; `deviceId` stays the same each time this Device logs in. */
export const LoginResponse = Type.Object(
  { accessToken: AccessToken, refreshToken: RefreshToken, deviceId: DeviceId },
  { additionalProperties: false },
);
export type LoginResponse = Static<typeof LoginResponse>;
