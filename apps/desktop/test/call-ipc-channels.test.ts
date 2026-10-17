import { describe, expect, it } from "vitest";
import type { CheckedIpcChannel } from "../src/main/ipc/checked-ipc-handler";
import { createCallIpcChannels } from "../src/main/ipc/call-ipc-channels";
import { desktopApiChannels } from "../src/preload/desktop-api";
import { fakeCallActions } from "./support/fake-call-actions";

const groupId = "MgZoqEdt4EEfhsMd_7xNqw";
const deviceId = "mJMEbgts33NWbvGmNqkuEw";
const offer = { kind: "description", type: "offer", sdp: "v=0" };

function channelNamed(name: string): {
  channel: CheckedIpcChannel;
  actions: ReturnType<typeof fakeCallActions>;
} {
  const actions = fakeCallActions();
  const channel = createCallIpcChannels(actions).find(
    (candidate) => candidate.name === name,
  );
  if (channel === undefined) throw new Error(`no channel named "${name}"`);
  return { channel, actions };
}

describe("the Call channels", () => {
  it.each([
    [desktopApiChannels.readCall, [groupId]],
    [desktopApiChannels.joinCall, [groupId]],
    [desktopApiChannels.leaveCall, [groupId]],
    [desktopApiChannels.sendCallSignal, [groupId, deviceId, offer]],
    [desktopApiChannels.dropCallParticipant, [groupId, deviceId]],
    [desktopApiChannels.readIceConfiguration, []],
    [desktopApiChannels.readCallSettings, []],
    [desktopApiChannels.changeCallSettings, [{ hideMyIp: true }]],
    [desktopApiChannels.changeCallSettings, [{}]],
    [
      desktopApiChannels.changeCallSettings,
      [
        {
          microphoneMode: "push-to-talk",
          pushToTalkKey: "KeyV",
          muteHotkey: "Ctrl+Shift+M",
          codec: "VP9",
        },
      ],
    ],
    [desktopApiChannels.changeCallSettings, [{ pushToTalkKey: null }]],
    [desktopApiChannels.changeCallSettings, [{ muteHotkey: "Alt+F9" }]],
    [desktopApiChannels.readVoiceControls, []],
    [desktopApiChannels.listShareSources, []],
    [desktopApiChannels.measureCpu, [30]],
    [desktopApiChannels.chooseShareSource, ["screen:0:0"]],
    [desktopApiChannels.chooseShareSource, ["window:132456:0"]],
  ])("%s accepts %j", (name, args) => {
    expect(channelNamed(name).channel.argumentsMatch(args)).toBe(true);
  });

  it.each([
    [desktopApiChannels.joinCall, []],
    [desktopApiChannels.joinCall, ["not-a-group"]],
    [desktopApiChannels.sendCallSignal, [groupId, deviceId]],
    [desktopApiChannels.sendCallSignal, [groupId, "x", offer]],
    [
      desktopApiChannels.sendCallSignal,
      [groupId, deviceId, { ...offer, script: "<x>" }],
    ],
    [desktopApiChannels.dropCallParticipant, [groupId]],
    [desktopApiChannels.readIceConfiguration, [groupId]],
    [desktopApiChannels.changeCallSettings, [{ hideMyIp: "yes" }]],
    [desktopApiChannels.changeCallSettings, [{ codec: "AV1" }]],
    [desktopApiChannels.changeCallSettings, [{ muteHotkey: "Shift+M" }]],
    [desktopApiChannels.changeCallSettings, [{ muteHotkey: "M" }]],
    [desktopApiChannels.changeCallSettings, [{ microphoneMode: "always" }]],
    [desktopApiChannels.changeCallSettings, [{ pushToTalkKey: "Key V" }]],
    [desktopApiChannels.changeCallSettings, [{ volume: 3 }]],
    [desktopApiChannels.chooseShareSource, ["camera:0:0"]],
    [desktopApiChannels.chooseShareSource, ["screen:0"]],
    [desktopApiChannels.chooseShareSource, []],
    [desktopApiChannels.measureCpu, [1]],
    [desktopApiChannels.measureCpu, [30.5]],
    [desktopApiChannels.measureCpu, [600]],
  ])("%s refuses %j", (name, args) => {
    expect(channelNamed(name).channel.argumentsMatch(args)).toBe(false);
  });

  it("passes a signal to the Call service as it came", async () => {
    const { channel, actions } = channelNamed(
      desktopApiChannels.sendCallSignal,
    );

    await channel.handle(groupId, deviceId, offer);

    expect(actions.sendCallSignal).toHaveBeenCalledExactlyOnceWith(
      groupId,
      deviceId,
      offer,
    );
  });
});
