import type { Credentials } from "../../../preload/desktop-api";
import {
  credentialsProblemMessage,
  UNEXPECTED_FAILURE_MESSAGE,
} from "./account-messages";
import { credentialsProblem } from "./credentials-check";

/** Sends checked credentials to the main process; resolves with a message to show, or undefined on success. */
export type CredentialsSender = (
  credentials: Credentials,
) => Promise<string | undefined>;

/**
 * Checks the typed credentials, sends them only if the server's rules hold, and returns the message to show, if any.
 * @example const message = await submitCredentials({ username, password }, sendSignUp);
 */
export async function submitCredentials(
  credentials: Credentials,
  send: CredentialsSender,
): Promise<string | undefined> {
  const problem = credentialsProblem(credentials);
  if (problem !== undefined) return credentialsProblemMessage(problem);
  try {
    return await send(credentials);
  } catch {
    // The main process refused or failed the call; its error names nothing the person can act on.
    return UNEXPECTED_FAILURE_MESSAGE;
  }
}
