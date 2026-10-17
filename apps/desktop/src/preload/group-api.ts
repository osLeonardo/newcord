import type { HubErrorCode } from "@newcord/shared";

/** A Group in the Group list; its ID is the base64url text Envelopes carry. */
export interface GroupSummary {
  readonly groupId: string;
  readonly name: string;
}

/** A pending Invitation, with the Group's name and who sent it (D13). */
export interface InvitationSummary {
  readonly invitationId: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly from: string;
}

/**
 * Why a Group action did not happen: the server's refusal, no answer from it, a value the app
 * refuses before sending, a Group this Device is not in, or Groups being unavailable until the
 * app is connected with its MLS module loaded.
 */
export type GroupRefusal =
  | HubErrorCode
  | "NOT_CONNECTED"
  | "CONNECTION_LOST"
  | "TIMED_OUT"
  | "INVALID_NAME"
  | "INVALID_USERNAME"
  | "INVALID_TEXT"
  | "NOT_IN_GROUP"
  | "UNAVAILABLE";

export type CreateGroupResult =
  | { readonly outcome: "created"; readonly group: GroupSummary }
  | { readonly outcome: "refused"; readonly refusal: GroupRefusal };

/** The outcome of a Group action that returns nothing else. */
export type GroupActionResult =
  | { readonly outcome: "done" }
  | { readonly outcome: "refused"; readonly refusal: GroupRefusal };

/** A Chat message as the Group chat shows it: always as text, never as HTML. */
export interface ChatMessage {
  readonly groupId: string;
  /** The server's sequence number; every Device shows messages in this order. */
  readonly seq: number;
  readonly messageId: string;
  readonly sender: string;
  /** Whether this Account sent it, from any of its Devices. */
  readonly own: boolean;
  readonly text: string;
  /** The sender's clock when it was sent, in milliseconds. */
  readonly sentAt: number;
}

export type SendMessageResult =
  | { readonly outcome: "sent"; readonly message: ChatMessage }
  | { readonly outcome: "refused"; readonly refusal: GroupRefusal };

/** The desktop API's Group calls (#6). */
export interface GroupApiCalls {
  listGroups(): Promise<readonly GroupSummary[]>;
  createGroup(name: string): Promise<CreateGroupResult>;
  inviteToGroup(groupId: string, username: string): Promise<GroupActionResult>;
  listInvitations(): Promise<readonly InvitationSummary[]>;
  answerInvitation(
    invitationId: string,
    accept: boolean,
  ): Promise<GroupActionResult>;
  listMessages(groupId: string): Promise<readonly ChatMessage[]>;
  sendMessage(groupId: string, text: string): Promise<SendMessageResult>;
}
