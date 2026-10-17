import {
  ChatTextPayload,
  GroupId,
  GroupName,
  InvitationId,
  Username,
} from "@newcord/shared";
import { Type, type Static } from "typebox";
import { desktopApiChannels } from "../../preload/desktop-api";
import type {
  ChatMessage,
  CreateGroupResult,
  GroupActionResult,
  GroupApiCalls,
  GroupMemberSummary,
  GroupSummary,
  InvitationSummary,
  SendMessageResult,
} from "../../preload/group-api";
import { checkedChannel, type CheckedIpcChannel } from "./checked-ipc-handler";
import { argumentsMatching } from "./typebox-arguments";

const NoArguments = Type.Tuple([]);
type NoArguments = Static<typeof NoArguments>;
/** The screens check the name first, so a refused call means the interface misbehaved. */
const CreateGroupArguments = Type.Tuple([GroupName]);
type CreateGroupArguments = Static<typeof CreateGroupArguments>;
const InviteArguments = Type.Tuple([GroupId, Username]);
type InviteArguments = Static<typeof InviteArguments>;
const AnswerArguments = Type.Tuple([InvitationId, Type.Boolean()]);
type AnswerArguments = Static<typeof AnswerArguments>;
const GroupArguments = Type.Tuple([GroupId]);
type GroupArguments = Static<typeof GroupArguments>;
/** The screen checks the length first; the shared schema holds the limit. */
const SendMessageArguments = Type.Tuple([
  GroupId,
  ChatTextPayload.properties.text,
]);
type SendMessageArguments = Static<typeof SendMessageArguments>;
const MemberArguments = Type.Tuple([GroupId, Username]);
type MemberArguments = Static<typeof MemberArguments>;

/**
 * The channels of the desktop API's Group calls (#6), each behind the sender and argument checks.
 * @example [...createGroupIpcChannels(groupActions)]
 */
export function createGroupIpcChannels(
  actions: GroupApiCalls,
): CheckedIpcChannel[] {
  return [
    checkedChannel<NoArguments, readonly GroupSummary[]>({
      name: desktopApiChannels.listGroups,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.listGroups(),
    }),
    checkedChannel<CreateGroupArguments, CreateGroupResult>({
      name: desktopApiChannels.createGroup,
      expectedArguments: "name: GroupName",
      argumentsMatch: argumentsMatching(CreateGroupArguments),
      handle: (name) => actions.createGroup(name),
    }),
    checkedChannel<InviteArguments, GroupActionResult>({
      name: desktopApiChannels.inviteToGroup,
      expectedArguments: "groupId: GroupId, username: Username",
      argumentsMatch: argumentsMatching(InviteArguments),
      handle: (groupId, username) => actions.inviteToGroup(groupId, username),
    }),
    checkedChannel<NoArguments, readonly InvitationSummary[]>({
      name: desktopApiChannels.listInvitations,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.listInvitations(),
    }),
    checkedChannel<AnswerArguments, GroupActionResult>({
      name: desktopApiChannels.answerInvitation,
      expectedArguments: "invitationId: InvitationId, accept: boolean",
      argumentsMatch: argumentsMatching(AnswerArguments),
      handle: (invitationId, accept) =>
        actions.answerInvitation(invitationId, accept),
    }),
    checkedChannel<GroupArguments, readonly ChatMessage[]>({
      name: desktopApiChannels.listMessages,
      expectedArguments: "groupId: GroupId",
      argumentsMatch: argumentsMatching(GroupArguments),
      handle: (groupId) => actions.listMessages(groupId),
    }),
    checkedChannel<SendMessageArguments, SendMessageResult>({
      name: desktopApiChannels.sendMessage,
      expectedArguments:
        "groupId: GroupId, text: string of 1 to 4000 characters",
      argumentsMatch: argumentsMatching(SendMessageArguments),
      handle: (groupId, text) => actions.sendMessage(groupId, text),
    }),
    checkedChannel<GroupArguments, readonly GroupMemberSummary[]>({
      name: desktopApiChannels.listMembers,
      expectedArguments: "groupId: GroupId",
      argumentsMatch: argumentsMatching(GroupArguments),
      handle: (groupId) => actions.listMembers(groupId),
    }),
    checkedChannel<MemberArguments, GroupActionResult>({
      name: desktopApiChannels.removeMember,
      expectedArguments: "groupId: GroupId, username: Username",
      argumentsMatch: argumentsMatching(MemberArguments),
      handle: (groupId, username) => actions.removeMember(groupId, username),
    }),
    checkedChannel<GroupArguments, GroupActionResult>({
      name: desktopApiChannels.leaveGroup,
      expectedArguments: "groupId: GroupId",
      argumentsMatch: argumentsMatching(GroupArguments),
      handle: (groupId) => actions.leaveGroup(groupId),
    }),
  ];
}
