import { Type, type Static } from "typebox";

/** A refresh token: 32 random bytes in base64url (D37b). */
export const RefreshToken = Type.String({ pattern: "^[A-Za-z0-9_-]{43}$" });

/** An access token: a JWT signed with HS256 that expires after 15 minutes (D37b, D37c). */
export const AccessToken = Type.String();

/** The body of `POST /refresh`, which swaps a refresh token for new tokens (D62). */
export const RefreshRequest = Type.Object(
  { refreshToken: RefreshToken },
  { additionalProperties: false },
);
export type RefreshRequest = Static<typeof RefreshRequest>;

/** The `200` body of `POST /refresh`; the refresh token sent is now used and never works again. */
export const RefreshResponse = Type.Object(
  { accessToken: AccessToken, refreshToken: RefreshToken },
  { additionalProperties: false },
);
export type RefreshResponse = Static<typeof RefreshResponse>;
