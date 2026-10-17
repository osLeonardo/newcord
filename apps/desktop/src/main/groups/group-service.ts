import { randomBytes } from "node:crypto";
import {
  GroupName,
  Username,
  type InviteAcceptedEnvelope,
} from "@newcord/shared";
import { Value } from "typebox/value";
import type {
  CreateGroupResult,
  GroupActionResult,
  GroupApiCalls,
  GroupSummary,
  InvitationSummary,
} from "../../preload/group-api";
import type { HubEnvelopeHandlers } from "../hub/hub-inbox";
import type { HubOutcome } from "../hub/hub-requester";
import {
  chatMessageReceived,
  listChatMessages,
  sendChatMessage,
} from "./group-chat";
import { addAccount } from "./group-commits";
import {
  leaveGroup,
  leaveRequested,
  listGroupMembers,
  removeGroupMember,
} from "./group-members";
import {
  groupIdFromText,
  groupIdText,
  type GroupContext,
} from "./group-context";
import { receiveDelivery, type DeliveryHooks } from "./group-deliveries";

const GROUP_ID_BYTES = 16;
/** How often a Device retries adding someone after another Member's commit won the epoch. */
const ADD_ATTEMPTS = 3;

/** The Group features the interface calls, and what the service does with the server's Envelopes. */
export interface GroupService extends GroupApiCalls {
  readonly inboxHandlers: HubEnvelopeHandlers;
}

export interface GroupServiceOptions {
  readonly hooks?: DeliveryHooks;
  readonly newGroupId?: () => Uint8Array;
}

/**
 * Creates the Group service: Groups, Invitations, and the automatic additions accepted
 * Invitations prompt (#6, Step 02).
 * @example const groups = createGroupService(context);
 */
export function createGroupService(
  context: GroupContext,
  options: GroupServiceOptions = {},
): GroupService {
  const addsUnderWay = new Set<string>();
  const hooks: DeliveryHooks = {
    messageReceived: (groupId, delivery, message) =>
      chatMessageReceived(context, groupId, delivery, message),
    proposalReceived: (groupId, delivery, proposal) =>
      leaveRequested(context, groupId, delivery, proposal),
    ...options.hooks,
  };
  return {
    listGroups: () => Promise.resolve(groupSummaries(context)),
    createGroup: (name) => createGroup(context, name, options.newGroupId),
    inviteToGroup: (groupId, username) => invite(context, groupId, username),
    listInvitations: () => Promise.resolve(invitationSummaries(context)),
    answerInvitation: (invitationId, accept) =>
      answerInvitation(context, invitationId, accept),
    listMessages: (groupId) =>
      Promise.resolve(listChatMessages(context, groupId)),
    sendMessage: (groupId, text) => sendChatMessage(context, groupId, text),
    listMembers: (groupId) =>
      Promise.resolve(listGroupMembers(context, groupId)),
    removeMember: (groupId, username) =>
      removeGroupMember(context, groupId, username),
    leaveGroup: (groupId) => leaveGroup(context, groupId),
    inboxHandlers: {
      "mls.welcome": (delivery) => receiveDelivery(context, delivery, hooks),
      "mls.commit": (delivery) => receiveDelivery(context, delivery, hooks),
      "mls.message": (delivery) => receiveDelivery(context, delivery, hooks),
      "mls.proposal": (delivery) => receiveDelivery(context, delivery, hooks),
      invitation: (envelope): void => {
        context.localGroups.putInvitation({
          ...envelope,
          groupId: groupIdFromText(envelope.groupId),
        });
        context.events.invitationsChanged();
      },
      "invite.accepted": (prompt) =>
        addFromPrompt(context, prompt, addsUnderWay),
      "device.new": (prompt) => addFromPrompt(context, prompt, addsUnderWay),
      "group.renamed": (envelope): void => {
        context.localGroups.rename(
          groupIdFromText(envelope.groupId),
          envelope.name,
        );
        context.events.groupsChanged();
      },
    },
  };
}

function groupSummaries(context: GroupContext): GroupSummary[] {
  return context.localGroups.list().map((group) => ({
    groupId: groupIdText(group.groupId),
    name: group.name,
  }));
}

function invitationSummaries(context: GroupContext): InvitationSummary[] {
  return context.localGroups.invitations().map((invitation) => ({
    ...invitation,
    groupId: groupIdText(invitation.groupId),
  }));
}

async function createGroup(
  context: GroupContext,
  name: string,
  newGroupId: () => Uint8Array = () =>
    new Uint8Array(randomBytes(GROUP_ID_BYTES)),
): Promise<CreateGroupResult> {
  if (!Value.Check(GroupName, name)) {
    return { outcome: "refused", refusal: "INVALID_NAME" };
  }
  const groupId = newGroupId();
  const reply = await context.mls.runThenSend(
    (engine) => engine.createGroup(groupId),
    () =>
      context.requester.request({
        type: "group.create",
        groupId: groupIdText(groupId),
        name,
      }),
  );
  if (!reply.ok) return { outcome: "refused", refusal: reply.code };
  context.localGroups.add({ groupId, name }, 0);
  context.events.groupsChanged();
  return { outcome: "created", group: { groupId: groupIdText(groupId), name } };
}

/** The server answers an Invitation from someone the invitee blocks like any other (D57). */
async function invite(
  context: GroupContext,
  groupId: string,
  username: string,
): Promise<GroupActionResult> {
  if (!Value.Check(Username, username)) {
    return { outcome: "refused", refusal: "INVALID_USERNAME" };
  }
  if (!context.localGroups.has(groupIdFromText(groupId))) {
    return { outcome: "refused", refusal: "NOT_IN_GROUP" };
  }
  return actionResult(
    await context.requester.request({ type: "invite", groupId, username }),
  );
}

async function answerInvitation(
  context: GroupContext,
  invitationId: string,
  accept: boolean,
): Promise<GroupActionResult> {
  const reply = await context.requester.request({
    type: "invite.reply",
    invitationId,
    accept,
  });
  if (reply.ok || reply.code === "INVITATION_NOT_FOUND") {
    context.localGroups.removeInvitation(invitationId);
    context.events.invitationsChanged();
  }
  return actionResult(reply);
}

function actionResult(reply: HubOutcome): GroupActionResult {
  return reply.ok
    ? { outcome: "done" }
    : { outcome: "refused", refusal: reply.code };
}

/**
 * Adds an Account whose Invitation was accepted, or a Member's new Devices (D56): either way the
 * server hands out Key packages for exactly the Account's Devices missing from the Group. The
 * server re-sends the prompt to every online Member until a commit adds it, so one addition at a
 * time per Account is enough; a lost race is retried after the winning commit, which then usually
 * leaves nothing to add.
 */
function addFromPrompt(
  context: GroupContext,
  prompt: Pick<InviteAcceptedEnvelope, "groupId" | "username">,
  addsUnderWay: Set<string>,
  attemptsLeft = ADD_ATTEMPTS,
): void {
  const groupId = groupIdFromText(prompt.groupId);
  const key = `${prompt.groupId}:${prompt.username}`;
  if (!context.localGroups.has(groupId) || addsUnderWay.has(key)) return;
  addsUnderWay.add(key);
  void context.lanes
    .run(groupId, () => addAccount(context, groupId, prompt.username))
    .then((outcome) => {
      addsUnderWay.delete(key);
      if (outcome === "lost-race" && attemptsLeft > 1) {
        addFromPrompt(context, prompt, addsUnderWay, attemptsLeft - 1);
      }
    })
    .catch((error: unknown) => {
      addsUnderWay.delete(key);
      context.reportError(error);
    });
}
