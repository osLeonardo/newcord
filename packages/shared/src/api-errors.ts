/** The `code` field of an error response, so the app can tell refusals with the same status apart. */
export const ApiErrorCode = {
  UsernameTaken: "USERNAME_TAKEN",
  IdentityKeyTaken: "IDENTITY_KEY_TAKEN",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
