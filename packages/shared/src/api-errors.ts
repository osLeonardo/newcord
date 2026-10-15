/** The `code` field of an error response, so the app can tell refusals with the same status apart. */
export const ApiErrorCode = {
  UsernameTaken: "USERNAME_TAKEN",
  IdentityKeyTaken: "IDENTITY_KEY_TAKEN",
  /** Login: the same answer for an unknown username and a wrong password. */
  InvalidCredentials: "INVALID_CREDENTIALS",
  /** Refresh: unknown, expired or already used; the Device must log in again. */
  InvalidRefreshToken: "INVALID_REFRESH_TOKEN",
  /** Missing, malformed, forged or expired; the Device should refresh and retry. */
  InvalidAccessToken: "INVALID_ACCESS_TOKEN",
  RateLimited: "RATE_LIMITED",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
