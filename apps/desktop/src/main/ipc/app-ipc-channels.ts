import { Password, TypedRecoveryCode, Username } from "@newcord/shared";
import { Type, type Static } from "typebox";
import {
  desktopApiChannels,
  type LogInResult,
  type PasswordChangeResult,
  type PasswordRecoveryResult,
  type SessionState,
  type SignUpResult,
} from "../../preload/desktop-api";
import type { DesktopApiCalls } from "../../preload/desktop-api";
import type { AccountActions } from "../account/account-actions";
import { createCallIpcChannels } from "./call-ipc-channels";
import { createGroupIpcChannels } from "./group-ipc-channels";
import { createShellIpcChannels } from "./shell-ipc-channels";
import { checkedChannel, type CheckedIpcChannel } from "./checked-ipc-handler";
import { argumentsMatching } from "./typebox-arguments";

/** The screens check the same rules first, so a refused call means the interface misbehaved. */
const CredentialsArguments = Type.Tuple([
  Type.Object(
    { username: Username, password: Password },
    { additionalProperties: false },
  ),
  Type.Object(
    { switchAccount: Type.Boolean() },
    { additionalProperties: false },
  ),
]);
type CredentialsArguments = Static<typeof CredentialsArguments>;
const PasswordChangeArguments = Type.Tuple([Password]);
type PasswordChangeArguments = Static<typeof PasswordChangeArguments>;
const PasswordRecoveryArguments = Type.Tuple([
  Type.Object(
    {
      username: Username,
      recoveryCode: TypedRecoveryCode,
      newPassword: Password,
    },
    { additionalProperties: false },
  ),
]);
type PasswordRecoveryArguments = Static<typeof PasswordRecoveryArguments>;
const NoArguments = Type.Tuple([]);
type NoArguments = Static<typeof NoArguments>;
const CREDENTIALS_DESCRIPTION =
  "credentials: { username: Username, password: Password }, choice: { switchAccount: boolean }";

/**
 * Every channel the preload API calls; each one is registered behind the sender and argument checks.
 * @example for (const channel of createAppIpcChannels(accountActions)) registerCheckedIpcHandler(ipcMain, isTrustedSender, channel);
 */
export function createAppIpcChannels(
  actions: DesktopApiCalls,
): readonly CheckedIpcChannel[] {
  return [
    ...accountIpcChannels(actions),
    ...createGroupIpcChannels(actions),
    ...createCallIpcChannels(actions),
    ...createShellIpcChannels(actions),
  ];
}

function accountIpcChannels(actions: AccountActions): CheckedIpcChannel[] {
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
      handle: (credentials, choice) => actions.signUp(credentials, choice),
    }),
    checkedChannel<CredentialsArguments, LogInResult>({
      name: desktopApiChannels.logIn,
      expectedArguments: CREDENTIALS_DESCRIPTION,
      argumentsMatch: argumentsMatching(CredentialsArguments),
      handle: (credentials, choice) => actions.logIn(credentials, choice),
    }),
    checkedChannel<NoArguments, SessionState>({
      name: desktopApiChannels.logOut,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.logOut(),
    }),
    checkedChannel<NoArguments, readonly string[]>({
      name: desktopApiChannels.readOnlineAccounts,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.readOnlineAccounts(),
    }),
    checkedChannel<PasswordChangeArguments, PasswordChangeResult>({
      name: desktopApiChannels.changePassword,
      expectedArguments: "newPassword: Password",
      argumentsMatch: argumentsMatching(PasswordChangeArguments),
      handle: (newPassword) => actions.changePassword(newPassword),
    }),
    checkedChannel<PasswordRecoveryArguments, PasswordRecoveryResult>({
      name: desktopApiChannels.recoverPassword,
      expectedArguments:
        "recovery: { username: Username, recoveryCode: TypedRecoveryCode, newPassword: Password }",
      argumentsMatch: argumentsMatching(PasswordRecoveryArguments),
      handle: (recovery) => actions.recoverPassword(recovery),
    }),
  ];
}
