import { ApiErrorCode } from "@newcord/shared";
import { ApiError } from "../api-error.js";

/**
 * The 409 for an identity key another Account already holds, at sign-up and at login (D60).
 * Example: `throw identityKeyTakenError();`
 */
export function identityKeyTakenError(): ApiError {
  return new ApiError(
    409,
    ApiErrorCode.IdentityKeyTaken,
    "This identity key is already registered to an Account; a key belongs to one Account only",
  );
}
