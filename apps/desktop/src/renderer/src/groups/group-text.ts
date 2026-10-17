import { GroupName, Username } from "@newcord/shared";
import { Value } from "typebox/value";
import type { GroupRefusal } from "../../../preload/group-api";
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
