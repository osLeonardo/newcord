import type {
  MlsCommitDeliveryEnvelope,
  MlsMessageDeliveryEnvelope,
  MlsProposalDeliveryEnvelope,
  MlsWelcomeDeliveryEnvelope,
} from "@newcord/shared";
import type { IncomingMls } from "../mls/mls-engine";
import {
  forgetGroup,
  groupIdFromText,
  groupIdText,
  payloadBytes,
  type GroupContext,
} from "./group-context";

/** Every queued Envelope the server delivers for a Group. */
export type GroupDelivery =
  | MlsCommitDeliveryEnvelope
  | MlsWelcomeDeliveryEnvelope
  | MlsMessageDeliveryEnvelope
  | MlsProposalDeliveryEnvelope;

type IncomingOf<Kind extends IncomingMls["kind"]> = Extract<
  IncomingMls,
  { kind: Kind }
>;

/** What later features do with what a delivery turned out to contain. */
export interface DeliveryHooks {
  commitApplied?(
    groupId: Uint8Array,
    delivery: MlsCommitDeliveryEnvelope,
    commit: IncomingOf<"commit">,
  ): void;
  messageReceived?(
    groupId: Uint8Array,
    delivery: MlsMessageDeliveryEnvelope,
    message: IncomingOf<"message">,
  ): void;
  proposalReceived?(
    groupId: Uint8Array,
    delivery: MlsProposalDeliveryEnvelope,
    proposal: IncomingOf<"proposal">,
  ): void;
}

/**
 * Processes a delivery in its Group's lane: once only, in order, saving the MLS state before the
 * `ack` that lets the server delete its copy. A delivery that cannot be processed is still
 * acknowledged, since it will never become readable.
 * @example receiveDelivery(context, delivery, hooks);
 */
export function receiveDelivery(
  context: GroupContext,
  delivery: GroupDelivery,
  hooks: DeliveryHooks,
): void {
  const groupId = groupIdFromText(delivery.groupId);
  void context.lanes
    .run(groupId, () => {
      processDelivery(context, groupId, delivery, hooks);
      return Promise.resolve();
    })
    .catch(context.reportError);
}

function processDelivery(
  context: GroupContext,
  groupId: Uint8Array,
  delivery: GroupDelivery,
  hooks: DeliveryHooks,
): void {
  if (isNew(context, groupId, delivery)) {
    try {
      applyDelivery(context, groupId, delivery, hooks);
    } catch (error) {
      context.reportError(error);
    }
    context.localGroups.markProcessed(groupId, delivery.seq);
  }
  context.sendAck(groupId, delivery.seq);
}

/** A welcome may start or restart a Group (D24); anything else needs a Group the Device is in. */
function isNew(
  context: GroupContext,
  groupId: Uint8Array,
  delivery: GroupDelivery,
): boolean {
  const lastSeq = context.localGroups.lastSeq(groupId);
  if (lastSeq === undefined) return delivery.type === "mls.welcome";
  return delivery.seq > lastSeq;
}

function applyDelivery(
  context: GroupContext,
  groupId: Uint8Array,
  delivery: GroupDelivery,
  hooks: DeliveryHooks,
): void {
  switch (delivery.type) {
    case "mls.welcome":
      joinGroup(context, groupId, delivery);
      return;
    case "mls.commit":
      applyCommit(context, groupId, delivery, hooks);
      return;
    case "mls.message":
      hooks.messageReceived?.(
        groupId,
        delivery,
        incomingOfKind(context, delivery.message, "message"),
      );
      return;
    case "mls.proposal":
      hooks.proposalReceived?.(
        groupId,
        delivery,
        incomingOfKind(context, delivery.proposal, "proposal"),
      );
  }
}

function joinGroup(
  context: GroupContext,
  groupId: Uint8Array,
  delivery: MlsWelcomeDeliveryEnvelope,
): void {
  const welcome = payloadBytes(delivery.welcome);
  const joined = context.mls.run((engine) => engine.joinFromWelcome(welcome));
  if (groupIdText(joined) !== delivery.groupId) {
    throw new Error(
      `The welcome delivered for Group ${delivery.groupId} joined Group ${groupIdText(joined)}`,
    );
  }
  context.localGroups.add({ groupId, name: delivery.groupName }, delivery.seq);
  context.events.groupsChanged();
}

function applyCommit(
  context: GroupContext,
  groupId: Uint8Array,
  delivery: MlsCommitDeliveryEnvelope,
  hooks: DeliveryHooks,
): void {
  const commit = incomingOfKind(context, delivery.commit, "commit");
  hooks.commitApplied?.(groupId, delivery, commit);
  if (commit.removed.includes(context.ownIdentity)) {
    forgetGroup(context, groupId, "removed");
    return;
  }
  // Member lists read the MLS state again.
  context.events.groupsChanged();
}

function incomingOfKind<Kind extends IncomingMls["kind"]>(
  context: GroupContext,
  payload: string,
  kind: Kind,
): IncomingOf<Kind> {
  const bytes = payloadBytes(payload);
  const incoming = context.mls.run((engine) => engine.processIncoming(bytes));
  if (incoming.kind !== kind) {
    throw new Error(
      `A delivery sent as ${kind} held an MLS ${incoming.kind}; expected a ${kind}`,
    );
  }
  return incoming as IncomingOf<Kind>;
}
