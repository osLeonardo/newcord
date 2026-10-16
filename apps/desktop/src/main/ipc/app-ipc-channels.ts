import { Password, Username } from "@newcord/shared";
import { Type, type Static } from "typebox";
import {
  desktopApiChannels,
  type LogInResult,
  type SessionState,
  type SignUpResult,
} from "../../preload/desktop-api";
import type { AccountActions } from "../account/account-actions";
import type { CheckedIpcChannel } from "./checked-ipc-handler";
import { argumentsMatching } from "./typebox-arguments";

/** The screens check the same rules first, so a refused call means the interface misbehaved. */
const CredentialsArguments = Type.Tuple([
  Type.Object(
    { username: Username, password: Password },
    { additionalProperties: false },
  ),
]);
type CredentialsArguments = Static<typeof CredentialsArguments>;
const NoArguments = Type.Tuple([]);
type NoArguments = Static<typeof NoArguments>;
const CREDENTIALS_DESCRIPTION =
  "credentials: { username: Username, password: Password }";

/**
 * Every channel the preload API calls; each one is registered behind the sender and argument checks.
 * @example for (const channel of createAppIpcChannels(accountActions)) registerCheckedIpcHandler(ipcMain, isTrustedSender, channel);
 */
export function createAppIpcChannels(
  actions: AccountActions,
): readonly CheckedIpcChannel[] {
  return [
    checkedChannel<NoArguments, SessionState>({
      name: desktopApiChannels.readSessionState,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.readSessionState(),
    }),
    checkedChannel<CredentialsArguments, SignUpResult>({
      name: desktopApiChannels.signUp,
      expectedArguments: CREDENTIALS_DESCRIPTION,
      argumentsMatch: argumentsMatching(CredentialsArguments),
      handle: (credentials) => actions.signUp(credentials),
    }),
    checkedChannel<CredentialsArguments, LogInResult>({
      name: desktopApiChannels.logIn,
      expectedArguments: CREDENTIALS_DESCRIPTION,
      argumentsMatch: argumentsMatching(CredentialsArguments),
      handle: (credentials) => actions.logIn(credentials),
    }),
    checkedChannel<NoArguments, SessionState>({
      name: desktopApiChannels.logOut,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.logOut(),
    }),
  ];
}

/** Ties a channel's `handle` to the argument types its schema check guarantees. */
function checkedChannel<Arguments extends readonly unknown[], Result>(
  channel: CheckedIpcChannel<Arguments, Result>,
): CheckedIpcChannel<Arguments, Result> {
  return channel;
}
