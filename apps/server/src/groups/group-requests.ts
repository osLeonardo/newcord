import {
  HubErrorCode,
  PROTOCOL_VERSION,
  type GroupCreateEnvelope,
  type GroupRenameEnvelope,
} from "@newcord/shared";
import type { HubContext, HubMessenger } from "../hub/hub-messenger.js";
import type { HubRequestHandlers } from "../hub/hub-requests.js";
import type { GroupStore } from "./group-store.js";

export interface GroupRequestDependencies {
  groupStore: Pick<
    GroupStore,
    "create" | "isActiveMember" | "rename" | "activeMemberDeviceIds"
  >;
  messenger: HubMessenger;
  clock: () => number;
  /** Told after a Group was created, so the creator's other Devices are prompted in (D56). */
  onGroupCreated?: (groupId: Buffer) => void;
}

/**
 * Creates the handlers of `group.create` and `group.rename` (D12, D40).
 * Example: `const handlers = createGroupRequestHandlers({ groupStore, messenger, clock });`
 */
export function createGroupRequestHandlers(
  dependencies: GroupRequestDependencies,
): Pick<HubRequestHandlers, "group.create" | "group.rename"> {
  return {
    "group.create": (context, envelope): void =>
      createGroup(dependencies, context, envelope),
    "group.rename": (context, envelope): void =>
      renameGroup(dependencies, context, envelope),
  };
}

/** The bytes of a Group ID that passed the `GroupId` schema. */
export function groupIdBytes(groupId: string): Buffer {
  return Buffer.from(groupId, "base64url");
}

function createGroup(
  dependencies: GroupRequestDependencies,
  context: HubContext,
  envelope: GroupCreateEnvelope,
): void {
  const groupId = groupIdBytes(envelope.groupId);
  const created = dependencies.groupStore.create({
    groupId,
    name: envelope.name,
    creatorDeviceId: context.owner.deviceId,
    createdAt: dependencies.clock(),
  });
  dependencies.messenger.reply(
    context,
    envelope.requestId,
    created ? { ok: true } : { ok: false, code: HubErrorCode.GroupExists },
  );
  if (created) dependencies.onGroupCreated?.(groupId);
}

function renameGroup(
  dependencies: GroupRequestDependencies,
  context: HubContext,
  envelope: GroupRenameEnvelope,
): void {
  const groupId = groupIdBytes(envelope.groupId);
  const { groupStore, messenger } = dependencies;
  if (!groupStore.isActiveMember(groupId, context.owner.deviceId)) {
    messenger.reply(context, envelope.requestId, {
      ok: false,
      code: HubErrorCode.NotAMember,
    });
    return;
  }
  groupStore.rename(groupId, envelope.name);
  const others = groupStore
    .activeMemberDeviceIds(groupId)
    .filter((deviceId) => deviceId !== context.owner.deviceId);
  messenger.toDevices(others, {
    v: PROTOCOL_VERSION,
    type: "group.renamed",
    groupId: envelope.groupId,
    name: envelope.name,
    by: context.owner.username,
  });
  messenger.reply(context, envelope.requestId, { ok: true });
}
