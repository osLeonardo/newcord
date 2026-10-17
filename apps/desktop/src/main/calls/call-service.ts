import {
  CALL_PARTICIPANT_LIMIT,
  isStaleCallMessage,
  type CallPayload,
  type CallSignal,
} from "@newcord/shared";
import type {
  CallApiCalls,
  CallSummary,
  JoinCallResult,
} from "../../preload/call-api";
import type { GroupActionResult } from "../../preload/group-api";
import { groupIdFromText, type GroupContext } from "../groups/group-context";
import { sendGroupPayload } from "../groups/group-payloads";
import type { DeviceIdentity } from "../mls/credential-identity";
import { callSelfOf, callSummaryOf, type CallParticipant } from "./call-state";

/** The Call functions of the window, plus what the hub tells them. */
export interface CallService extends CallApiCalls {
  /** Drops the Devices of Accounts that are no longer online (#9's spec). */
  onlineAccountsChanged(usernames: readonly string[]): void;
}

/**
 * Creates the Call service over the logged-in Device's Groups. Call messages travel only inside
 * MLS; the window gets plain details through the preload API (10-m3-build step 4).
 * @example const calls = createCallService(context); await calls.joinCall(groupId);
 */
export function createCallService(context: GroupContext): CallService {
  return {
    readCall: (groupId) => Promise.resolve(summaryOf(context, groupId)),
    joinCall: (groupId) => joinCall(context, groupId),
    leaveCall: (groupId) => leaveCall(context, groupId),
    sendCallSignal: (groupId, to, signal) =>
      sendCallSignal(context, groupId, to, signal),
    dropCallParticipant: (groupId, deviceId): Promise<void> => {
      if (context.calls.left(groupId, deviceId)) announce(context, groupId);
      return Promise.resolve();
    },
    onlineAccountsChanged: (usernames): void => {
      for (const groupId of context.calls.keepOnly(usernames)) {
        announce(context, groupId);
      }
    },
  };
}

/**
 * Acts on a Call message from another Device: a join or leave updates who is in the Call, and a
 * signal for this Device reaches the window while it is in that Call. Stale ones are ignored.
 * @example callMessageReceived(context, groupId, sender, payload);
 */
export function callMessageReceived(
  context: GroupContext,
  groupId: string,
  sender: DeviceIdentity,
  payload: CallPayload,
): void {
  if (isStaleCallMessage(payload.sentAt, context.now())) return;
  const self = selfOf(context);
  if (sender.deviceId === self.deviceId) return;
  const participant = { username: sender.username, deviceId: sender.deviceId };
  switch (payload.type) {
    case "call.join":
      if (context.calls.joined(groupId, participant)) {
        announce(context, groupId);
      }
      return;
    case "call.leave":
      if (context.calls.left(groupId, sender.deviceId)) {
        announce(context, groupId);
      }
      return;
    case "call.signal":
      signalReceived(context, groupId, participant, payload);
  }
}

function signalReceived(
  context: GroupContext,
  groupId: string,
  participant: CallParticipant,
  payload: Extract<CallPayload, { type: "call.signal" }>,
): void {
  const self = selfOf(context);
  if (payload.to !== self.deviceId) return;
  if (context.calls.activeGroup() !== groupId) return;
  // Someone already in the Call answers a join with a signal: that is how a joiner hears of them.
  if (context.calls.joined(groupId, participant)) announce(context, groupId);
  context.events.callSignalReceived({
    groupId,
    from: participant.deviceId,
    signal: payload.signal,
  });
}

async function joinCall(
  context: GroupContext,
  groupId: string,
): Promise<JoinCallResult> {
  const id = groupIdFromText(groupId);
  if (!context.localGroups.has(id)) {
    return { outcome: "refused", refusal: "NOT_IN_GROUP" };
  }
  if (context.calls.activeGroup() === groupId) {
    return { outcome: "joined", call: summaryOf(context, groupId) };
  }
  if (context.calls.othersIn(groupId).length >= CALL_PARTICIPANT_LIMIT) {
    return { outcome: "refused", refusal: "CALL_FULL" };
  }
  const current = context.calls.activeGroup();
  if (current !== undefined) await leaveCall(context, current);
  const reply = await context.lanes.run(id, () =>
    sendGroupPayload(context, id, { type: "call.join", sentAt: context.now() }),
  );
  if (!reply.ok) return { outcome: "refused", refusal: reply.code };
  context.calls.setActiveGroup(groupId);
  announce(context, groupId);
  return { outcome: "joined", call: summaryOf(context, groupId) };
}

/** Leaves here even when call.leave cannot be sent; the others drop this Device after 30 seconds. */
async function leaveCall(
  context: GroupContext,
  groupId: string,
): Promise<GroupActionResult> {
  if (context.calls.activeGroup() !== groupId) {
    return { outcome: "refused", refusal: "NOT_IN_CALL" };
  }
  context.calls.setActiveGroup(undefined);
  announce(context, groupId);
  const id = groupIdFromText(groupId);
  if (!context.localGroups.has(id)) return { outcome: "done" };
  await context.lanes.run(id, () =>
    sendGroupPayload(context, id, {
      type: "call.leave",
      sentAt: context.now(),
    }),
  );
  return { outcome: "done" };
}

async function sendCallSignal(
  context: GroupContext,
  groupId: string,
  to: string,
  signal: CallSignal,
): Promise<GroupActionResult> {
  if (context.calls.activeGroup() !== groupId) {
    return { outcome: "refused", refusal: "NOT_IN_CALL" };
  }
  const id = groupIdFromText(groupId);
  const reply = await context.lanes.run(id, () =>
    sendGroupPayload(context, id, {
      type: "call.signal",
      to,
      signal,
      sentAt: context.now(),
    }),
  );
  return reply.ok
    ? { outcome: "done" }
    : { outcome: "refused", refusal: reply.code };
}

function announce(context: GroupContext, groupId: string): void {
  context.events.callChanged(summaryOf(context, groupId));
}

function summaryOf(context: GroupContext, groupId: string): CallSummary {
  return callSummaryOf(context.calls, groupId, selfOf(context));
}

function selfOf(context: GroupContext): CallParticipant {
  return callSelfOf(context.ownIdentity);
}
