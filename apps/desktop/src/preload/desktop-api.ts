import type { ApiErrorCode } from "@newcord/shared";
import type {
  CallApiCalls,
  CallSettingsApiCalls,
  CallSummary,
  ReceivedCallSignal,
} from "./call-api";
import type { GroupApiCalls, GroupLeftNotice } from "./group-api";

/** A username and password as typed on the sign-up or login screen. */
export interface Credentials {
  readonly username: string;
  readonly password: string;
}

/** Whether this installation is logged in, and the Account it belongs to; null before its first sign-up or login. */
export type SessionState =
  | { readonly status: "logged-in"; readonly username: string }
  | { readonly status: "logged-out"; readonly username: string | null };

/** Whether the person confirmed the warning that entering another Account erases this app's local data (D60). */
export interface AccountSwitchChoice {
  readonly switchAccount: boolean;
}

/**
 * Why a sign-up or login did not happen: the server's error code, the server being out of reach or
 * answering outside its contract, or this installation belonging to another Account while the
 * switch was not confirmed (D60).
 */
export type AccountRefusal =
  | ApiErrorCode
  | "SERVER_UNREACHABLE"
  | "UNEXPECTED_RESPONSE"
  | "ANOTHER_ACCOUNT_STORED";

/** A sign-up's outcome; the Recovery code is shown once and stored nowhere (D55). */
export type SignUpResult =
  | {
      readonly outcome: "signed-up";
      readonly recoveryCode: string;
      readonly session: SessionState;
    }
  | { readonly outcome: "refused"; readonly refusal: AccountRefusal };

export type LogInResult =
  | { readonly outcome: "logged-in"; readonly session: SessionState }
  | { readonly outcome: "refused"; readonly refusal: AccountRefusal };

/** A password change's outcome: this Device stays logged in, and the server logs out the Account's other Devices (D55, D66). */
export type PasswordChangeResult =
  | { readonly outcome: "changed" }
  | { readonly outcome: "refused"; readonly refusal: AccountRefusal };

/** What the recovery screen sends; the Recovery code may be typed with spaces, dashes, any letter case and look-alike letters. */
export interface PasswordRecovery {
  readonly username: string;
  readonly recoveryCode: string;
  readonly newPassword: string;
}

/** A recovery's outcome: the new Recovery code, shown once, and the session state to log in from (D55, D66). */
export type PasswordRecoveryResult =
  | {
      readonly outcome: "recovered";
      readonly recoveryCode: string;
      readonly session: SessionState;
    }
  | { readonly outcome: "refused"; readonly refusal: AccountRefusal };

/** Stops a listener from hearing any more changes. */
export type Unsubscribe = () => void;

/** The desktop API's account and session calls (#3). */
export interface AccountApiCalls {
  readSessionState(): Promise<SessionState>;
  signUp(
    credentials: Credentials,
    choice: AccountSwitchChoice,
  ): Promise<SignUpResult>;
  logIn(
    credentials: Credentials,
    choice: AccountSwitchChoice,
  ): Promise<LogInResult>;
  /** Ends the session on the server and on this Device; resolves logged out even when the server is out of reach. */
  logOut(): Promise<SessionState>;
  /** The other Accounts online now, sorted by username; empty while logged out or disconnected. */
  readOnlineAccounts(): Promise<readonly string[]>;
  /** Sets a new password from this logged-in Device, without the old one (D55). */
  changePassword(newPassword: string): Promise<PasswordChangeResult>;
  /** Sets a new password with the Recovery code; it logs no Device in. */
  recoverPassword(recovery: PasswordRecovery): Promise<PasswordRecoveryResult>;
}

/** The desktop API's calls into the main process, each checked there for its sender and arguments. */
export interface DesktopApiCalls
  extends AccountApiCalls, GroupApiCalls, CallApiCalls, CallSettingsApiCalls {}

/** The changes the main process tells the interface about. */
export interface DesktopApiSubscriptions {
  /** Hears the session state whenever the server ends the session (D62, D66). */
  onSessionChanged(listener: (session: SessionState) => void): Unsubscribe;
  onOnlineAccountsChanged(
    listener: (usernames: readonly string[]) => void,
  ): Unsubscribe;
  /** Hears that the Group list changed; the interface reads it again. */
  onGroupsChanged(listener: () => void): Unsubscribe;
  /** Hears that the pending Invitations changed; the interface reads them again. */
  onInvitationsChanged(listener: () => void): Unsubscribe;
  /** Hears which Group's chat history changed; the interface reads it again. */
  onMessagesChanged(listener: (groupId: string) => void): Unsubscribe;
  /** Hears that this Device left a Group or was removed from it. */
  onGroupLeft(listener: (notice: GroupLeftNotice) => void): Unsubscribe;
  /** Hears that the Account's block list changed; chats and member lists read again. */
  onBlocksChanged(listener: () => void): Unsubscribe;
  /** Hears a Group's Call whenever someone joins or leaves it, this Device included. */
  onCallChanged(listener: (call: CallSummary) => void): Unsubscribe;
  /** Hears the WebRTC signals other Participants send this Device. */
  onCallSignal(listener: (signal: ReceivedCallSignal) => void): Unsubscribe;
}

/** The named functions the preload gives the interface as `window.desktopApi`; keys and tokens never cross it. */
export interface DesktopApi extends DesktopApiCalls, DesktopApiSubscriptions {}

/** The IPC channel behind each call of the desktop API. */
export const desktopApiChannels = {
  readSessionState: "session:read-state",
  signUp: "account:sign-up",
  logIn: "account:log-in",
  logOut: "session:log-out",
  readOnlineAccounts: "presence:read-online",
  changePassword: "password:change",
  recoverPassword: "password:recover",
  listGroups: "groups:list",
  createGroup: "groups:create",
  inviteToGroup: "groups:invite",
  listInvitations: "invitations:list",
  answerInvitation: "invitations:answer",
  listMessages: "messages:list",
  sendMessage: "messages:send",
  listMembers: "members:list",
  removeMember: "members:remove",
  leaveGroup: "groups:leave",
  listBlocked: "blocks:list",
  blockAccount: "blocks:block",
  unblockAccount: "blocks:unblock",
  readSafetyNumber: "safety:read",
  markVerified: "safety:verify",
  readCall: "calls:read",
  joinCall: "calls:join",
  leaveCall: "calls:leave",
  sendCallSignal: "calls:send-signal",
  dropCallParticipant: "calls:drop",
  readIceConfiguration: "calls:read-ice",
  readCallSettings: "settings:read-call",
  changeCallSettings: "settings:change-call",
} as const satisfies Record<keyof DesktopApiCalls, string>;

/** The IPC channel the main process sends each change on. */
export const desktopApiEventChannels = {
  onSessionChanged: "session:changed",
  onOnlineAccountsChanged: "presence:changed",
  onGroupsChanged: "groups:changed",
  onInvitationsChanged: "invitations:changed",
  onMessagesChanged: "messages:changed",
  onGroupLeft: "groups:left",
  onBlocksChanged: "blocks:changed",
  onCallChanged: "calls:changed",
  onCallSignal: "calls:signal",
} as const satisfies Record<keyof DesktopApiSubscriptions, string>;
