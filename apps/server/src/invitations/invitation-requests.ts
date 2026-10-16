import { randomBytes as cryptoRandomBytes } from "node:crypto";
import {
  GROUP_PEOPLE_LIMIT,
  HubErrorCode,
  PROTOCOL_VERSION,
  type InvitationEnvelope,
  type InviteEnvelope,
  type InviteReplyEnvelope,
} from "@newcord/shared";
import type { AccountStore, StoredAccount } from "../accounts/account-store.js";
import type { BlockStore } from "../blocks/block-store.js";
import { groupIdBytes } from "../groups/group-requests.js";
import type { GroupStore } from "../groups/group-store.js";
import type { HubContext, HubMessenger } from "../hub/hub-messenger.js";
import type { HubRequestHandlers } from "../hub/hub-requests.js";
import type { RequestRateLimit } from "../hub/request-rate-limit.js";
import type { RandomBytes } from "../random-bytes.js";
import type {
  DeliverableInvitation,
  InvitationStore,
} from "./invitation-store.js";

const INVITATION_ID_BYTES = 16;

export interface InvitationRequestDependencies {
  groupStore: Pick<
    GroupStore,
    "isActiveMember" | "isAccountActiveMember" | "nameOf"
  >;
  invitationStore: InvitationStore;
  accountStore: Pick<AccountStore, "findByUsername">;
  blockStore: Pick<BlockStore, "isBlocked">;
  invitationRateLimit: RequestRateLimit;
  messenger: HubMessenger;
  clock: () => number;
  randomBytes?: RandomBytes;
  /** Told when an invitee accepts, so the Group's Members can be prompted to add them. */
  onInvitationAccepted?: (groupId: Buffer, invitee: number) => void;
}

/**
 * Creates the handlers of `invite` and `invite.reply` (D13, D57).
 * Example: `const handlers = createInvitationRequestHandlers(dependencies);`
 */
export function createInvitationRequestHandlers(
  dependencies: InvitationRequestDependencies,
): Pick<HubRequestHandlers, "invite" | "invite.reply"> {
  return {
    invite: (context, envelope): void =>
      invite(dependencies, context, envelope),
    "invite.reply": (context, envelope): void =>
      answerInvitation(dependencies, context, envelope),
  };
}

/**
 * Sends a newly authenticated socket its Account's pending Invitations.
 * Example: `sendInvitationsOnHello(dependencies, context);`
 */
export function sendInvitationsOnHello(
  dependencies: Pick<
    InvitationRequestDependencies,
    "invitationStore" | "messenger"
  >,
  context: HubContext,
): void {
  const pending = dependencies.invitationStore.deliverableFor(
    context.owner.userId,
  );
  for (const invitation of pending) {
    dependencies.messenger.toSocket(
      context.socket,
      invitationEnvelope(invitation),
    );
  }
}

function invite(
  dependencies: InvitationRequestDependencies,
  context: HubContext,
  envelope: InviteEnvelope,
): void {
  const groupId = groupIdBytes(envelope.groupId);
  const invitee = dependencies.accountStore.findByUsername(envelope.username);
  const refusal = inviteRefusal(dependencies, context, groupId, invitee);
  if (refusal !== undefined || invitee === undefined) {
    dependencies.messenger.reply(context, envelope.requestId, {
      ok: false,
      code: refusal ?? HubErrorCode.AccountNotFound,
    });
    return;
  }
  storeAndDeliver(dependencies, context, envelope, invitee.userId);
  dependencies.messenger.reply(context, envelope.requestId, { ok: true });
}

/** The rate limit counts only Members' attempts, before any username is looked at. */
function inviteRefusal(
  dependencies: InvitationRequestDependencies,
  context: HubContext,
  groupId: Buffer,
  invitee: StoredAccount | undefined,
): HubErrorCode | undefined {
  const { groupStore, invitationStore } = dependencies;
  if (!groupStore.isActiveMember(groupId, context.owner.deviceId)) {
    return HubErrorCode.NotAMember;
  }
  if (
    !dependencies.invitationRateLimit.tryCount(String(context.owner.userId))
  ) {
    return HubErrorCode.RateLimited;
  }
  if (invitee === undefined) return HubErrorCode.AccountNotFound;
  if (groupStore.isAccountActiveMember(groupId, invitee.userId)) {
    return HubErrorCode.AlreadyAMember;
  }
  if (invitationStore.hasOpenInvitation(groupId, invitee.userId)) {
    return HubErrorCode.AlreadyInvited;
  }
  return invitationStore.peopleCount(groupId) >= GROUP_PEOPLE_LIMIT
    ? HubErrorCode.GroupFull
    : undefined;
}

/** An Invitation from someone the invitee blocks is stored but never delivered, and the inviter cannot tell (D57). */
function storeAndDeliver(
  dependencies: InvitationRequestDependencies,
  context: HubContext,
  envelope: InviteEnvelope,
  invitee: number,
): void {
  const randomBytes = dependencies.randomBytes ?? cryptoRandomBytes;
  const invitationId = randomBytes(INVITATION_ID_BYTES).toString("base64url");
  const hidden = dependencies.blockStore.isBlocked(
    invitee,
    context.owner.userId,
  );
  dependencies.invitationStore.create({
    id: invitationId,
    groupId: groupIdBytes(envelope.groupId),
    fromUser: context.owner.userId,
    toUser: invitee,
    hidden,
    createdAt: dependencies.clock(),
  });
  if (hidden) return;
  dependencies.messenger.toAccount(
    invitee,
    invitationEnvelope({
      invitationId,
      groupId: groupIdBytes(envelope.groupId),
      groupName:
        dependencies.groupStore.nameOf(groupIdBytes(envelope.groupId)) ?? "",
      fromUsername: context.owner.username,
    }),
  );
}

function answerInvitation(
  dependencies: InvitationRequestDependencies,
  context: HubContext,
  envelope: InviteReplyEnvelope,
): void {
  const { invitationStore, messenger } = dependencies;
  const invitee = context.owner.userId;
  const groupId = invitationStore.pendingGroupOf(
    envelope.invitationId,
    invitee,
  );
  if (groupId === undefined) {
    messenger.reply(context, envelope.requestId, {
      ok: false,
      code: HubErrorCode.InvitationNotFound,
    });
    return;
  }
  invitationStore.answer(
    envelope.invitationId,
    envelope.accept ? "accepted" : "declined",
  );
  messenger.reply(context, envelope.requestId, { ok: true });
  if (envelope.accept) dependencies.onInvitationAccepted?.(groupId, invitee);
}

function invitationEnvelope(
  invitation: DeliverableInvitation,
): InvitationEnvelope {
  return {
    v: PROTOCOL_VERSION,
    type: "invitation",
    invitationId: invitation.invitationId,
    groupId: invitation.groupId.toString("base64url"),
    groupName: invitation.groupName,
    from: invitation.fromUsername,
  };
}
