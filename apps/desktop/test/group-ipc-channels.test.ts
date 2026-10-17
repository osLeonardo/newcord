import { describe, expect, it } from "vitest";
import type { CheckedIpcChannel } from "../src/main/ipc/checked-ipc-handler";
import { createGroupIpcChannels } from "../src/main/ipc/group-ipc-channels";
import { desktopApiChannels } from "../src/preload/desktop-api";
import { fakeGroupActions } from "./support/fake-group-actions";

const groupId = "MgZoqEdt4EEfhsMd_7xNqw";
const invitationId = "mJMEbgts33NWbvGmNqkuEw";

function channelNamed(name: string): {
  channel: CheckedIpcChannel;
  actions: ReturnType<typeof fakeGroupActions>;
} {
  const actions = fakeGroupActions();
  const channel = createGroupIpcChannels(actions).find(
    (candidate) => candidate.name === name,
  );
  if (channel === undefined) throw new Error(`no channel named "${name}"`);
  return { channel, actions };
}

describe("the Group channels", () => {
  it.each([
    [desktopApiChannels.listGroups, []],
    [desktopApiChannels.listInvitations, []],
    [desktopApiChannels.createGroup, ["friends"]],
    [desktopApiChannels.inviteToGroup, [groupId, "bruno"]],
    [desktopApiChannels.answerInvitation, [invitationId, true]],
    [desktopApiChannels.listMessages, [groupId]],
    [desktopApiChannels.sendMessage, [groupId, "hello"]],
    [desktopApiChannels.sendMessage, [groupId, "x".repeat(4000)]],
    [desktopApiChannels.listBlocked, []],
    [desktopApiChannels.blockAccount, ["bruno"]],
    [desktopApiChannels.unblockAccount, ["bruno"]],
  ])("%s accepts %j", (name, args) => {
    expect(channelNamed(name).channel.argumentsMatch(args)).toBe(true);
  });

  it.each([
    [desktopApiChannels.listGroups, ["x"]],
    [desktopApiChannels.createGroup, [""]],
    [desktopApiChannels.createGroup, ["n".repeat(65)]],
    [desktopApiChannels.createGroup, [7]],
    [desktopApiChannels.inviteToGroup, [groupId, "Bruno"]],
    [desktopApiChannels.inviteToGroup, ["not-a-group", "bruno"]],
    [desktopApiChannels.inviteToGroup, [groupId]],
    [desktopApiChannels.answerInvitation, [invitationId, "yes"]],
    [desktopApiChannels.answerInvitation, ["short", true]],
    [desktopApiChannels.listMessages, []],
    [desktopApiChannels.sendMessage, [groupId, ""]],
    [desktopApiChannels.sendMessage, [groupId, "x".repeat(4001)]],
    [desktopApiChannels.sendMessage, [groupId, 42]],
    [desktopApiChannels.listBlocked, ["bruno"]],
    [desktopApiChannels.blockAccount, ["Bruno"]],
    [desktopApiChannels.blockAccount, []],
    [desktopApiChannels.unblockAccount, [groupId, "bruno"]],
  ])("%s refuses %j", (name, args) => {
    expect(channelNamed(name).channel.argumentsMatch(args)).toBe(false);
  });

  it("passes the arguments to the matching Group call", async () => {
    const { channel, actions } = channelNamed(desktopApiChannels.inviteToGroup);

    await channel.handle(groupId, "bruno");

    expect(actions.inviteToGroup).toHaveBeenCalledExactlyOnceWith(
      groupId,
      "bruno",
    );
  });
});
