import { Password, Username } from "@newcord/shared";
import type { TString, TStringOptions } from "typebox";
import { Value } from "typebox/value";
import type { Credentials } from "../../../preload/desktop-api";

/** What the screens refuse before calling the main process, which checks the same shared schemas. */
export type CredentialsProblem =
  "INVALID_USERNAME" | "PASSWORD_TOO_SHORT" | "PASSWORD_TOO_LONG";

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
  if (Value.Check(Password, credentials.password)) return undefined;
  // JSON Schema lengths count characters (code points), not UTF-16 units.
  const characters = Array.from(credentials.password).length;
  return characters < passwordLimits.minLength
    ? "PASSWORD_TOO_SHORT"
    : "PASSWORD_TOO_LONG";
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
