import { describe, expect, it, vi } from "vitest";
import { createShellIpcChannels } from "../src/main/ipc/shell-ipc-channels";
import { desktopApiChannels } from "../src/preload/desktop-api";

const channels = createShellIpcChannels({
  readStartupNotice: vi.fn(() => Promise.resolve(true)),
  dismissStartupNotice: vi.fn(() => Promise.resolve()),
  reportCallMedia: vi.fn(() => Promise.resolve()),
});

function channelNamed(name: string): (typeof channels)[number] {
  const channel = channels.find((candidate) => candidate.name === name);
  if (channel === undefined) throw new Error(`no channel named "${name}"`);
  return channel;
}

describe("the shell channels", () => {
  it.each([
    [desktopApiChannels.readStartupNotice, []],
    [desktopApiChannels.dismissStartupNotice, []],
    [desktopApiChannels.reportCallMedia, [{ muted: true, sharing: false }]],
  ])("%s accepts %j", (name, args) => {
    expect(channelNamed(name).argumentsMatch(args)).toBe(true);
  });

  it.each([
    [desktopApiChannels.readStartupNotice, ["now"]],
    [desktopApiChannels.reportCallMedia, [{ muted: true }]],
    [desktopApiChannels.reportCallMedia, [{ muted: "yes", sharing: false }]],
    [
      desktopApiChannels.reportCallMedia,
      [{ muted: true, sharing: false, groupId: "x" }],
    ],
  ])("%s refuses %j", (name, args) => {
    expect(channelNamed(name).argumentsMatch(args)).toBe(false);
  });
});
