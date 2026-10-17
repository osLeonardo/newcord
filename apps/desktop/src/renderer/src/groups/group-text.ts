import { GroupName, Username } from "@newcord/shared";
import { Value } from "typebox/value";
import type {
  GroupLeftNotice,
  GroupMemberSummary,
  GroupNotice,
  GroupRefusal,
} from "../../../preload/group-api";
import { usernameLimits } from "../account/credentials-check";

const groupRefusalMessages: ReadonlyMap<string, string> = new Map(
  Object.entries({
    NOT_A_MEMBER: "You are not a Member of this Group anymore.",
    GROUP_EXISTS: "That Group already exists. Try again.",
    ACCOUNT_NOT_FOUND: "There is no Account with that username.",
    CANNOT_BLOCK_SELF: "You cannot block yourself.",
    ALREADY_A_MEMBER: "That person is already in this Group.",
    ALREADY_INVITED: "That person already has an Invitation to this Group.",
    GROUP_FULL: "This Group already has 10 people, counting Invitations.",
    INVITATION_NOT_FOUND: "That Invitation is no longer pending.",
    RATE_LIMITED: "Too many attempts. Try again later.",
    NOTHING_TO_ADD: "There is nobody to add.",
    WRONG_EPOCH: "The Group changed meanwhile. Try again.",
    INVALID_CHANGE: "The server refused this change.",
    NOT_CONNECTED: "Not connected to the server. Try again in a moment.",
    CONNECTION_LOST: "The connection dropped. Try again.",
    TIMED_OUT: "The server did not answer. Try again.",
    INVALID_NAME: "Group names have 1 to 64 characters.",
    INVALID_USERNAME: `Usernames have ${usernameLimits.minLength} to ${usernameLimits.maxLength} characters: lowercase letters, digits and underscores.`,
    INVALID_TEXT: "Messages have 1 to 4,000 characters.",
    PERSON_NOT_IN_GROUP: "That person is not in this Group.",
    CANNOT_REMOVE_SELF: "Leave the Group instead of removing yourself.",
    NOT_IN_GROUP: "You are not in this Group.",
    UNAVAILABLE: "Groups are not available yet.",
    CANNOT_VERIFY_SELF: "Compare safety numbers with someone else.",
    SAFETY_NUMBER_CHANGED:
      "The safety number changed while it was open. Compare the new one.",
  } satisfies Record<GroupRefusal, string>),
);

/**
 * The sentence a Group screen shows when the main process refuses an action.
 * @example groupRefusalMessage("GROUP_FULL") // "This Group already has 10 people, counting Invitations."
 */
export function groupRefusalMessage(refusal: GroupRefusal): string {
  return (
    groupRefusalMessages.get(refusal) ?? "Something went wrong. Try again."
  );
}

/**
 * Why a Group name cannot be sent, or undefined when it can: 1 to 64 characters (09-m2-build Settings).
 * @example groupNameProblem("") // "Group names have 1 to 64 characters."
 */
export function groupNameProblem(name: string): string | undefined {
  return Value.Check(GroupName, name)
    ? undefined
    : groupRefusalMessage("INVALID_NAME");
}

/**
 * Why a username cannot be invited, or undefined when it can.
 * @example inviteUsernameProblem("Bruno") // "Usernames have 3 to 32 characters: ..."
 */
export function inviteUsernameProblem(username: string): string | undefined {
  return Value.Check(Username, username)
    ? undefined
    : groupRefusalMessage("INVALID_USERNAME");
}

/**
 * The line shown when this Device is no longer in a Group.
 * @example groupLeftMessage({ groupId, name: "friends", reason: "removed" }) // "You were removed from friends."
 */
export function groupLeftMessage(notice: GroupLeftNotice): string {
  const name = notice.name === "" ? "a Group" : notice.name;
  return notice.reason === "removed"
    ? `You were removed from ${name}.`
    : `You left ${name}.`;
}

/**
 * How the member list describes a person's Devices.
 * @example memberDevicesLabel({ username: "bruno", deviceCount: 2, self: false }) // "2 Devices"
 */
export function memberDevicesLabel(member: GroupMemberSummary): string {
  return member.deviceCount === 1
    ? "1 Device"
    : `${member.deviceCount} Devices`;
}

/**
 * A notice's line in the chat (D56, D71).
 * @example noticeText({ type: "new-device", username: "bruno" }) // "bruno has a new Device in this Group."
 */
export function noticeText(notice: GroupNotice): string {
  switch (notice.type) {
    case "new-device":
      return `${notice.username} has a new Device in this Group.`;
    case "safety-number-changed":
      return `${notice.username}'s safety number changed.`;
    case "group-over-limit":
      return `${notice.sender}'s change brought this Group to ${notice.people} people, over the limit of 10.`;
    case "commit-mismatch":
      return `${notice.sender}'s change did not match what it declared. It really added ${devicesText(notice.added)} and removed ${devicesText(notice.removed)}.`;
  }
}

/** Devices by their Account's name; a malformed identity is shown as it is. */
function devicesText(identities: readonly string[]): string {
  if (identities.length === 0) return "no Device";
  return identities
    .map((identity) => {
      const [username = identity, deviceId] = identity.split(":");
      return deviceId === undefined ? identity : `a Device of ${username}`;
    })
    .join(", ");
}
