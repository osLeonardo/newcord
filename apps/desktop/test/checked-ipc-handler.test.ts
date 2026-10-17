import { describe, expect, it, vi, type Mock } from "vitest";
import {
  registerCheckedIpcHandler,
  type CheckedIpcChannel,
  type IpcInvocation,
  type IpcInvokeListener,
  type IpcInvokeRegistry,
} from "../src/main/ipc/checked-ipc-handler";

const trustedInvocation: IpcInvocation = {
  sender: { id: 1 },
  senderFrame: { url: "file:///app/index.html", parent: null },
};
const untrustedInvocation: IpcInvocation = {
  sender: { id: 2 },
  senderFrame: { url: "https://evil.example/", parent: null },
};

class FakeIpcRegistry implements IpcInvokeRegistry {
  readonly listeners = new Map<string, IpcInvokeListener>();

  handle(channel: string, listener: IpcInvokeListener): void {
    this.listeners.set(channel, listener);
  }
}

function isTrustedSender(invocation: IpcInvocation): boolean {
  return invocation.sender.id === trustedInvocation.sender.id;
}

function greetingChannel(): {
  channel: CheckedIpcChannel<[name: string], string>;
  handle: Mock<(name: string) => Promise<string>>;
} {
  const handle = vi.fn((name: string) => Promise.resolve(`hello ${name}`));
  return {
    channel: {
      name: "greeting:say",
      expectedArguments: "name: string",
      argumentsMatch: (args): args is [name: string] =>
        args.length === 1 && typeof args[0] === "string",
      handle,
    },
    handle,
  };
}

function registeredListener(
  channel: CheckedIpcChannel<[name: string], string>,
): IpcInvokeListener {
  const registry = new FakeIpcRegistry();
  registerCheckedIpcHandler(registry, isTrustedSender, channel);
  const listener = registry.listeners.get(channel.name);
  if (listener === undefined) {
    throw new Error(`No listener registered for "${channel.name}"`);
  }
  return listener;
}

describe("registerCheckedIpcHandler", () => {
  it("runs the channel for the app's own window with valid arguments", async () => {
    const { channel, handle } = greetingChannel();

    await expect(
      registeredListener(channel)(trustedInvocation, "ana"),
    ).resolves.toBe("hello ana");
    expect(handle).toHaveBeenCalledWith("ana");
  });

  it("refuses a call from any other sender without running the channel", async () => {
    const { channel, handle } = greetingChannel();

    await expect(
      registeredListener(channel)(untrustedInvocation, "ana"),
    ).rejects.toThrow(
      /"greeting:say".*web contents 2.*https:\/\/evil\.example/,
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it.each([[[]], [[42]], [["ana", "extra"]], [[null]]])(
    "refuses the arguments %j without running the channel",
    async (args) => {
      const { channel, handle } = greetingChannel();

      await expect(
        registeredListener(channel)(trustedInvocation, ...args),
      ).rejects.toThrow(/"greeting:say".*expected \(name: string\)/);
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it("describes refused arguments by type, never by value", async () => {
    const listener = registeredListener(greetingChannel().channel);

    await expect(
      listener(trustedInvocation, "secret password", 7),
    ).rejects.toThrow("received (string, number)");
    await expect(
      listener(trustedInvocation, "secret password", 7),
    ).rejects.not.toThrow("secret password");
  });

  it("checks the sender before the arguments", async () => {
    await expect(
      registeredListener(greetingChannel().channel)(untrustedInvocation, 42),
    ).rejects.toThrow(/web contents 2/);
  });
});
