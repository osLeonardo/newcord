import { describe, expect, it, vi } from "vitest";
import { createUpdateIpcChannels } from "../src/main/ipc/update-ipc-channels";
import { desktopApiChannels } from "../src/preload/desktop-api";

const actions = {
  readUpdateOffer: vi.fn(() => Promise.resolve(true)),
  restartToUpdate: vi.fn(() => Promise.resolve("in-call" as const)),
};
const channels = createUpdateIpcChannels(actions);

function channelNamed(name: string): (typeof channels)[number] {
  const channel = channels.find((candidate) => candidate.name === name);
  if (channel === undefined) throw new Error(`no channel named "${name}"`);
  return channel;
}

describe("the update channels (#13)", () => {
  it.each([
    desktopApiChannels.readUpdateOffer,
    desktopApiChannels.restartToUpdate,
  ])("%s accepts no arguments and refuses any", (name) => {
    expect(channelNamed(name).argumentsMatch([])).toBe(true);
    expect(channelNamed(name).argumentsMatch([true])).toBe(false);
  });

  it("hands each call to the updater", async () => {
    await expect(
      channelNamed(desktopApiChannels.readUpdateOffer).handle(),
    ).resolves.toBe(true);
    await expect(
      channelNamed(desktopApiChannels.restartToUpdate).handle(),
    ).resolves.toBe("in-call");
  });
});
