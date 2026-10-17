import {
  HubErrorCode,
  KEY_PACKAGE_LOW_WATERMARK,
  PROTOCOL_VERSION,
  type DeviceKeyPackage,
  type KeyPackageCountEnvelope,
  type KeyPackageGetEnvelope,
} from "@newcord/shared";
import type { AccountStore } from "../accounts/account-store.js";
import { groupIdBytes } from "../groups/group-requests.js";
import type { GroupStore } from "../groups/group-store.js";
import type {
  HubContext,
  HubMessenger,
  ReplyOutcome,
} from "../hub/hub-messenger.js";
import type { HubRequestHandlers } from "../hub/hub-requests.js";
import type { RequestRateLimit } from "../hub/request-rate-limit.js";
import type { InvitationStore } from "../invitations/invitation-store.js";
import type { KeyPackageStore } from "./key-package-store.js";

export interface KeyPackageRequestDependencies {
  groupStore: Pick<
    GroupStore,
    "isActiveMember" | "isAccountActiveMember" | "devicesToAdd"
  >;
  invitationStore: Pick<InvitationStore, "hasAcceptedInvitation">;
  accountStore: Pick<AccountStore, "findByUsername">;
  keyPackageStore: KeyPackageStore;
  keyPackageRateLimit: RequestRateLimit;
  messenger: HubMessenger;
}

/**
 * Creates the handler of `keypackage.get`: one Key package per Device that may be added, only for
 * an Account with a reason to be added to the caller's Group (#5's spec).
 * Example: `const handlers = createKeyPackageRequestHandlers(dependencies);`
 */
export function createKeyPackageRequestHandlers(
  dependencies: KeyPackageRequestDependencies,
): Pick<HubRequestHandlers, "keypackage.get"> {
  return {
    "keypackage.get": (context, envelope): void => {
      dependencies.messenger.reply(
        context,
        envelope.requestId,
        handOutKeyPackages(dependencies, context, envelope),
      );
    },
  };
}

/**
 * Tells a newly authenticated socket how many ordinary Key packages its Device has.
 * Example: `sendKeyPackageCountOnHello(dependencies, context);`
 */
export function sendKeyPackageCountOnHello(
  dependencies: Pick<
    KeyPackageRequestDependencies,
    "keyPackageStore" | "messenger"
  >,
  context: HubContext,
): void {
  dependencies.messenger.toSocket(
    context.socket,
    countEnvelope(dependencies.keyPackageStore, context.owner.deviceId),
  );
}

function handOutKeyPackages(
  dependencies: KeyPackageRequestDependencies,
  context: HubContext,
  envelope: KeyPackageGetEnvelope,
): ReplyOutcome {
  const groupId = groupIdBytes(envelope.groupId);
  if (
    !dependencies.groupStore.isActiveMember(groupId, context.owner.deviceId)
  ) {
    return { ok: false, code: HubErrorCode.NotAMember };
  }
  if (
    !dependencies.keyPackageRateLimit.tryCount(String(context.owner.userId))
  ) {
    return { ok: false, code: HubErrorCode.RateLimited };
  }
  const target = dependencies.accountStore.findByUsername(envelope.username);
  if (target === undefined) {
    return { ok: false, code: HubErrorCode.AccountNotFound };
  }
  const deviceIds = addableDeviceIds(dependencies, groupId, target.userId);
  if (deviceIds.length === 0) {
    return { ok: false, code: HubErrorCode.NothingToAdd };
  }
  return { ok: true, keyPackages: takeKeyPackages(dependencies, deviceIds) };
}

/** An accepted Invitation, or Membership with a Device missing from the Group, is the only reason to add. */
function addableDeviceIds(
  dependencies: KeyPackageRequestDependencies,
  groupId: Buffer,
  userId: number,
): string[] {
  const { groupStore, invitationStore } = dependencies;
  const mayBeAdded =
    invitationStore.hasAcceptedInvitation(groupId, userId) ||
    groupStore.isAccountActiveMember(groupId, userId);
  return mayBeAdded ? groupStore.devicesToAdd(groupId, userId) : [];
}

function takeKeyPackages(
  dependencies: KeyPackageRequestDependencies,
  deviceIds: readonly string[],
): DeviceKeyPackage[] {
  const handedOut: DeviceKeyPackage[] = [];
  for (const deviceId of deviceIds) {
    const taken = dependencies.keyPackageStore.takeOne(deviceId);
    if (taken === undefined) continue;
    handedOut.push({ deviceId, keyPackage: taken.data.toString("base64") });
    if (!taken.lastResort) warnIfRunningLow(dependencies, deviceId);
  }
  return handedOut;
}

function warnIfRunningLow(
  dependencies: Pick<
    KeyPackageRequestDependencies,
    "keyPackageStore" | "messenger"
  >,
  deviceId: string,
): void {
  const envelope = countEnvelope(dependencies.keyPackageStore, deviceId);
  if (envelope.count < KEY_PACKAGE_LOW_WATERMARK) {
    dependencies.messenger.toDevices([deviceId], envelope);
  }
}

function countEnvelope(
  keyPackageStore: Pick<KeyPackageStore, "ordinaryCount">,
  deviceId: string,
): KeyPackageCountEnvelope {
  return {
    v: PROTOCOL_VERSION,
    type: "keypackage.count",
    count: keyPackageStore.ordinaryCount(deviceId),
  };
}
