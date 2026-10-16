import { Password, TypedRecoveryCode, Username } from "@newcord/shared";
import type { TString, TStringOptions } from "typebox";
import { Value } from "typebox/value";
import type { Credentials } from "../../../preload/desktop-api";

/** A password's length breaking the shared schema. */
export type PasswordProblem = "PASSWORD_TOO_SHORT" | "PASSWORD_TOO_LONG";

/** What the sign-up and login screens refuse before calling the main process, which checks the same shared schemas. */
export type CredentialsProblem = "INVALID_USERNAME" | PasswordProblem;

/** What the password screens refuse before calling the main process. */
export type NewPasswordProblem = PasswordProblem | "PASSWORDS_DIFFER";

/** What the recovery screen refuses before calling the main process. */
export type RecoveryProblem =
  "INVALID_USERNAME" | "INVALID_RECOVERY_CODE" | NewPasswordProblem;

/** Every problem a screen finds in what was typed. */
export type InputProblem = CredentialsProblem | RecoveryProblem;

/** A new password, typed twice. */
export interface NewPasswordInput {
  readonly newPassword: string;
  readonly repeatedPassword: string;
}

/** The recovery screen's fields. */
export interface RecoveryInput extends NewPasswordInput {
  readonly username: string;
  readonly recoveryCode: string;
}

export interface LengthLimits {
  readonly minLength: number;
  readonly maxLength: number;
}

/** The username's length limits, read from the shared schema so messages never drift from it. */
export const usernameLimits: LengthLimits = lengthLimitsOf(
  Username,
  "Username",
);

/** The password's length limits, read from the shared schema so messages never drift from it. */
export const passwordLimits: LengthLimits = lengthLimitsOf(
  Password,
  "Password",
);

/**
 * The first rule the typed credentials break, or undefined when the server's rules all hold.
 * @example credentialsProblem({ username: "Alice", password: "correct horse battery" }) // "INVALID_USERNAME"
 */
export function credentialsProblem(
  credentials: Credentials,
): CredentialsProblem | undefined {
  if (!Value.Check(Username, credentials.username)) return "INVALID_USERNAME";
  return passwordProblem(credentials.password);
}

/**
 * Whether a password is too short or too long for the shared schema.
 * @example passwordProblem("eleven char") // "PASSWORD_TOO_SHORT"
 */
export function passwordProblem(password: string): PasswordProblem | undefined {
  if (Value.Check(Password, password)) return undefined;
  // JSON Schema lengths count characters (code points), not UTF-16 units.
  const characters = Array.from(password).length;
  return characters < passwordLimits.minLength
    ? "PASSWORD_TOO_SHORT"
    : "PASSWORD_TOO_LONG";
}

/**
 * The first rule a new password typed twice breaks: its length, then the two copies differing.
 * @example newPasswordProblem({ newPassword: "correct horse battery", repeatedPassword: "correct horse" }) // "PASSWORDS_DIFFER"
 */
export function newPasswordProblem(
  input: NewPasswordInput,
): NewPasswordProblem | undefined {
  const problem = passwordProblem(input.newPassword);
  if (problem !== undefined) return problem;
  return input.newPassword === input.repeatedPassword
    ? undefined
    : "PASSWORDS_DIFFER";
}

/**
 * The first rule the recovery screen's fields break. A Recovery code passes in any letter case,
 * with spaces or dashes, and with O, I or L for 0 and 1 (08-m1-build Settings).
 * @example recoveryProblem({ username: "alice", recoveryCode: "0123", newPassword, repeatedPassword }) // "INVALID_RECOVERY_CODE"
 */
export function recoveryProblem(
  input: RecoveryInput,
): RecoveryProblem | undefined {
  if (!Value.Check(Username, input.username)) return "INVALID_USERNAME";
  if (!Value.Check(TypedRecoveryCode, input.recoveryCode)) {
    return "INVALID_RECOVERY_CODE";
  }
  return newPasswordProblem(input);
}

function lengthLimitsOf(schema: TString, schemaName: string): LengthLimits {
  // TypeBox keeps a schema's options on the schema object, untyped.
  const { minLength, maxLength } = schema as TString & TStringOptions;
  if (minLength === undefined || maxLength === undefined) {
    throw new Error(
      `The shared ${schemaName} schema has minLength ${minLength} and maxLength ${maxLength}; expected both to be numbers`,
    );
  }
  return { minLength, maxLength };
}
