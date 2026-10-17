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
  | "PERSON_NOT_IN_GROUP"
  | "CANNOT_REMOVE_SELF"
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
  readonly kind: "text";
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

/**
 * A system line in a Group's chat, stored on this Device and never sent (#6's spec): a commit that
 * did something other than declared or took the Group past 10 people (D71), or a new Device (D56).
 */
export type GroupNotice =
  | {
      readonly type: "commit-mismatch";
      readonly sender: string;
      /** The credential identities the commit really added and removed. */
      readonly added: readonly string[];
      readonly removed: readonly string[];
    }
  | {
      readonly type: "group-over-limit";
      readonly sender: string;
      readonly people: number;
    }
  | { readonly type: "new-device"; readonly username: string };

/** A notice as the chat shows it, at the position of the commit that caused it. */
export interface ChatNotice {
  readonly kind: "notice";
  readonly groupId: string;
  readonly seq: number;
  readonly notice: GroupNotice;
}

/** A line of the Group chat: a message or a notice. */
export type ChatEntry = ChatMessage | ChatNotice;

export type SendMessageResult =
  | { readonly outcome: "sent"; readonly message: ChatMessage }
  | { readonly outcome: "refused"; readonly refusal: GroupRefusal };

/** A person in a Group, with how many of their Devices are in it (from the MLS state). */
export interface GroupMemberSummary {
  readonly username: string;
  readonly deviceCount: number;
  readonly self: boolean;
}

/** Told when this Device is no longer in a Group: it left, or someone removed it. */
export interface GroupLeftNotice {
  readonly groupId: string;
  readonly name: string;
  readonly reason: "left" | "removed";
}

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
  listMessages(groupId: string): Promise<readonly ChatEntry[]>;
  sendMessage(groupId: string, text: string): Promise<SendMessageResult>;
  listMembers(groupId: string): Promise<readonly GroupMemberSummary[]>;
  /** Removes all of that person's Devices in one commit. */
  removeMember(groupId: string, username: string): Promise<GroupActionResult>;
  /** Sends this Device's leave request and forgets the Group and its history here (D57). */
  leaveGroup(groupId: string): Promise<GroupActionResult>;
}
