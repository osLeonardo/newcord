import { PROTOCOL_VERSION, type GroupPromptEnvelope } from "@newcord/shared";
import type { HubContext, HubMessenger } from "../hub/hub-messenger.js";
import type { GroupStore } from "./group-store.js";
import type { GroupPrompt, PromptStore } from "./prompt-store.js";

/** Sends the open prompts of Groups to their Members' apps, again and again until commits handle them. */
export interface GroupPrompter {
  /** Sends every open prompt of the Group to its online active Member Devices. */
  promptGroup(groupId: Buffer): void;
  /** Prompts every Group where the Account is an active Member, as when it gains a Device (D56). */
  promptAccountGroups(userId: number): void;
  /** Sends a newly authenticated socket the open prompts of its Device's Groups. */
  promptOnHello(context: HubContext): void;
}

export interface GroupPrompterDependencies {
  promptStore: PromptStore;
  groupStore: Pick<GroupStore, "activeMemberDeviceIds">;
  messenger: HubMessenger;
}

/**
 * Creates the prompter.
 * Example: `createGroupPrompter({ promptStore, groupStore, messenger }).promptGroup(groupId);`
 */
export function createGroupPrompter(
  dependencies: GroupPrompterDependencies,
): GroupPrompter {
  const { promptStore, groupStore, messenger } = dependencies;
  const promptGroup = (groupId: Buffer): void => {
    const prompts = promptStore.promptsOf(groupId);
    for (const deviceId of groupStore.activeMemberDeviceIds(groupId)) {
      sendEach(envelopesFor(prompts, groupId, deviceId), (envelope) => {
        messenger.toDevices([deviceId], envelope);
      });
    }
  };
  return {
    promptGroup,
    promptAccountGroups: (userId): void => {
      promptStore.activeGroupsOfAccount(userId).forEach(promptGroup);
    },
    promptOnHello: (context): void => {
      const { deviceId } = context.owner;
      for (const groupId of promptStore.activeGroupsOfDevice(deviceId)) {
        const prompts = promptStore.promptsOf(groupId);
        sendEach(envelopesFor(prompts, groupId, deviceId), (envelope) => {
          messenger.toSocket(context.socket, envelope);
        });
      }
    },
  };
}

function sendEach(
  envelopes: readonly GroupPromptEnvelope[],
  send: (envelope: GroupPromptEnvelope) => void,
): void {
  for (const envelope of envelopes) send(envelope);
}

/** A Device is never asked to resync itself: it cannot re-add itself. */
function envelopesFor(
  prompts: readonly GroupPrompt[],
  groupId: Buffer,
  deviceId: string,
): GroupPromptEnvelope[] {
  return promptsFor(prompts, deviceId).map((prompt) =>
    promptEnvelope(groupId, prompt),
  );
}

function promptsFor(
  prompts: readonly GroupPrompt[],
  deviceId: string,
): GroupPrompt[] {
  return prompts.filter(
    (prompt) => prompt.kind !== "resync" || prompt.deviceId !== deviceId,
  );
}

function promptEnvelope(
  groupId: Buffer,
  prompt: GroupPrompt,
): GroupPromptEnvelope {
  const common = {
    v: PROTOCOL_VERSION,
    groupId: groupId.toString("base64url"),
    username: prompt.username,
  } as const;
  switch (prompt.kind) {
    case "invite.accepted":
      return { ...common, type: "invite.accepted" };
    case "device.new":
      return { ...common, type: "device.new", deviceId: prompt.deviceId };
    case "resync":
      return { ...common, type: "resync", deviceId: prompt.deviceId };
  }
}
