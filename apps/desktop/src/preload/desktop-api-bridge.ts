import {
  desktopApiChannels,
  desktopApiEventChannels,
  type DesktopApi,
  type LogInResult,
  type PasswordChangeResult,
  type PasswordRecoveryResult,
  type SessionState,
  type SignUpResult,
  type Unsubscribe,
} from "./desktop-api";
import type {
  ChatEntry,
  CreateGroupResult,
  GroupActionResult,
  SafetyNumberResult,
  GroupLeftNotice,
  GroupMemberSummary,
  GroupSummary,
  InvitationSummary,
  SendMessageResult,
} from "./group-api";

/** `ipcRenderer.invoke`, which stays inside the preload and never reaches the interface. */
export type IpcInvoke = (
  channel: string,
  ...args: unknown[]
) => Promise<unknown>;

/** Listens on an IPC channel, handing the listener only the message's payload, never the IPC event. */
export type IpcSubscribe = (
  channel: string,
  listener: (payload: unknown) => void,
) => Unsubscribe;

/**
 * Builds the desktop API on IPC calls, each passing its own arguments and nothing else; the main process checks them.
 * @example contextBridge.exposeInMainWorld("desktopApi", createDesktopApi(invoke, subscribe));
 */
export function createDesktopApi(
  invoke: IpcInvoke,
  subscribe: IpcSubscribe,
): DesktopApi {
  // The main process answers each channel, and sends each change, with the type its action returns.
  return {
    readSessionState: () =>
      invoke(desktopApiChannels.readSessionState) as Promise<SessionState>,
    signUp: (credentials, choice) =>
      invoke(
        desktopApiChannels.signUp,
        credentials,
        choice,
      ) as Promise<SignUpResult>,
    logIn: (credentials, choice) =>
      invoke(
        desktopApiChannels.logIn,
        credentials,
        choice,
      ) as Promise<LogInResult>,
    logOut: () => invoke(desktopApiChannels.logOut) as Promise<SessionState>,
    readOnlineAccounts: () =>
      invoke(desktopApiChannels.readOnlineAccounts) as Promise<
        readonly string[]
      >,
    changePassword: (newPassword) =>
      invoke(
        desktopApiChannels.changePassword,
        newPassword,
      ) as Promise<PasswordChangeResult>,
    recoverPassword: (recovery) =>
      invoke(
        desktopApiChannels.recoverPassword,
        recovery,
      ) as Promise<PasswordRecoveryResult>,
    listGroups: () =>
      invoke(desktopApiChannels.listGroups) as Promise<readonly GroupSummary[]>,
    createGroup: (name) =>
      invoke(
        desktopApiChannels.createGroup,
        name,
      ) as Promise<CreateGroupResult>,
    inviteToGroup: (groupId, username) =>
      invoke(
        desktopApiChannels.inviteToGroup,
        groupId,
        username,
      ) as Promise<GroupActionResult>,
    listInvitations: () =>
      invoke(desktopApiChannels.listInvitations) as Promise<
        readonly InvitationSummary[]
      >,
    answerInvitation: (invitationId, accept) =>
      invoke(
        desktopApiChannels.answerInvitation,
        invitationId,
        accept,
      ) as Promise<GroupActionResult>,
    listMessages: (groupId) =>
      invoke(desktopApiChannels.listMessages, groupId) as Promise<
        readonly ChatEntry[]
      >,
    sendMessage: (groupId, text) =>
      invoke(
        desktopApiChannels.sendMessage,
        groupId,
        text,
      ) as Promise<SendMessageResult>,
    listMembers: (groupId) =>
      invoke(desktopApiChannels.listMembers, groupId) as Promise<
        readonly GroupMemberSummary[]
      >,
    removeMember: (groupId, username) =>
      invoke(
        desktopApiChannels.removeMember,
        groupId,
        username,
      ) as Promise<GroupActionResult>,
    leaveGroup: (groupId) =>
      invoke(
        desktopApiChannels.leaveGroup,
        groupId,
      ) as Promise<GroupActionResult>,
    listBlocked: () =>
      invoke(desktopApiChannels.listBlocked) as Promise<readonly string[]>,
    blockAccount: (username) =>
      invoke(
        desktopApiChannels.blockAccount,
        username,
      ) as Promise<GroupActionResult>,
    unblockAccount: (username) =>
      invoke(
        desktopApiChannels.unblockAccount,
        username,
      ) as Promise<GroupActionResult>,
    readSafetyNumber: (groupId, username) =>
      invoke(
        desktopApiChannels.readSafetyNumber,
        groupId,
        username,
      ) as Promise<SafetyNumberResult>,
    markVerified: (groupId, username, safetyNumber) =>
      invoke(
        desktopApiChannels.markVerified,
        groupId,
        username,
        safetyNumber,
      ) as Promise<GroupActionResult>,
    onBlocksChanged: (listener) =>
      subscribe(desktopApiEventChannels.onBlocksChanged, () => listener()),
    onGroupLeft: (listener) =>
      subscribe(desktopApiEventChannels.onGroupLeft, (payload) =>
        listener(payload as GroupLeftNotice),
      ),
    onMessagesChanged: (listener) =>
      subscribe(desktopApiEventChannels.onMessagesChanged, (payload) =>
        listener(payload as string),
      ),
    onGroupsChanged: (listener) =>
      subscribe(desktopApiEventChannels.onGroupsChanged, () => listener()),
    onInvitationsChanged: (listener) =>
      subscribe(desktopApiEventChannels.onInvitationsChanged, () => listener()),
    onSessionChanged: (listener) =>
      subscribe(desktopApiEventChannels.onSessionChanged, (payload) =>
        listener(payload as SessionState),
      ),
    onOnlineAccountsChanged: (listener) =>
      subscribe(desktopApiEventChannels.onOnlineAccountsChanged, (payload) =>
        listener(payload as readonly string[]),
      ),
  };
}
