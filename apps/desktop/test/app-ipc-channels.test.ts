import { describe, expect, it, vi, type Mock } from "vitest";
import type { AccountActions } from "../src/main/account/account-actions";
import { createAppIpcChannels } from "../src/main/ipc/app-ipc-channels";
import {
  registerCheckedIpcHandler,
  type CheckedIpcChannel,
  type IpcInvocation,
  type IpcInvokeListener,
} from "../src/main/ipc/checked-ipc-handler";
import {
  desktopApiChannels,
  type Credentials,
  type LogInResult,
  type SessionState,
  type SignUpResult,
} from "../src/preload/desktop-api";

const credentials: Credentials = {
  username: "alice_01",
  password: "correct horse battery staple",
};
const loggedIn: SessionState = { status: "logged-in", username: "alice_01" };
const loggedOut: SessionState = { status: "logged-out", username: "alice_01" };
const signedUp: SignUpResult = {
  outcome: "signed-up",
  recoveryCode: "0123456789ABCDEFGHJKMNPQ",
  session: loggedIn,
};
const logInResult: LogInResult = { outcome: "logged-in", session: loggedIn };
const onlineAccounts = ["bruno", "carla"];
const appInvocation: IpcInvocation = {
  sender: { id: 1 },
  senderFrame: { url: "file:///app/index.html", parent: null },
};

type FakeActions = {
  [Name in keyof AccountActions]: Mock<AccountActions[Name]>;
};

function fakeActions(): FakeActions {
  return {
    readSessionState: vi.fn<AccountActions["readSessionState"]>(() =>
      Promise.resolve(loggedIn),
    ),
    signUp: vi.fn<AccountActions["signUp"]>(() => Promise.resolve(signedUp)),
    logIn: vi.fn<AccountActions["logIn"]>(() => Promise.resolve(logInResult)),
    logOut: vi.fn<AccountActions["logOut"]>(() => Promise.resolve(loggedOut)),
    readOnlineAccounts: vi.fn<AccountActions["readOnlineAccounts"]>(() =>
      Promise.resolve(onlineAccounts),
    ),
  };
}

function channelNamed(
  channels: readonly CheckedIpcChannel[],
  name: string,
): CheckedIpcChannel {
  const channel = channels.find((candidate) => candidate.name === name);
  if (channel === undefined) throw new Error(`no channel named "${name}"`);
  return channel;
}

function registeredListener(channel: CheckedIpcChannel): IpcInvokeListener {
  let registered: IpcInvokeListener | undefined;
  registerCheckedIpcHandler(
    { handle: (_name, listener) => (registered = listener) },
    () => true,
    channel,
  );
  if (registered === undefined) throw new Error("nothing was registered");
  return registered;
}

describe("createAppIpcChannels", () => {
  it("has exactly one channel for each desktop API function", () => {
    const names = createAppIpcChannels(fakeActions()).map(
      (channel) => channel.name,
    );

    expect(names.toSorted()).toEqual(
      Object.values(desktopApiChannels).toSorted(),
    );
  });
});

describe.each([
  {
    name: desktopApiChannels.readSessionState,
    actionOf: (actions: FakeActions): Mock => actions.readSessionState,
    result: loggedIn,
  },
  {
    name: desktopApiChannels.logOut,
    actionOf: (actions: FakeActions): Mock => actions.logOut,
    result: loggedOut,
  },
  {
    name: desktopApiChannels.readOnlineAccounts,
    actionOf: (actions: FakeActions): Mock => actions.readOnlineAccounts,
    result: onlineAccounts,
  },
])("the $name channel", ({ name, actionOf, result }) => {
  it("runs its action without arguments and returns its result", async () => {
    const actions = fakeActions();
    const channel = channelNamed(createAppIpcChannels(actions), name);

    expect(channel.argumentsMatch([])).toBe(true);
    await expect(channel.handle()).resolves.toEqual(result);
    expect(actionOf(actions)).toHaveBeenCalledOnce();
  });

  it.each([[[undefined]], [[{}]], [["alice"]]])(
    "refuses the arguments %j",
    (args) => {
      const channel = channelNamed(createAppIpcChannels(fakeActions()), name);

      expect(channel.argumentsMatch(args)).toBe(false);
    },
  );
});

describe.each([
  {
    name: desktopApiChannels.signUp,
    actionOf: (actions: FakeActions): Mock => actions.signUp,
    result: signedUp,
  },
  {
    name: desktopApiChannels.logIn,
    actionOf: (actions: FakeActions): Mock => actions.logIn,
    result: logInResult,
  },
])("the $name channel", ({ name, actionOf, result }) => {
  it("passes the credentials to its action and returns its result", async () => {
    const actions = fakeActions();
    const channel = channelNamed(createAppIpcChannels(actions), name);

    expect(channel.argumentsMatch([credentials])).toBe(true);
    await expect(channel.handle(credentials)).resolves.toEqual(result);
    expect(actionOf(actions)).toHaveBeenCalledExactlyOnceWith(credentials);
  });

  it.each([
    ["no arguments", []],
    ["a second argument", [credentials, credentials]],
    ["a field outside the schema", [{ ...credentials, identityKey: "x" }]],
    ["a missing password", [{ username: credentials.username }]],
    ["a username that is not a string", [{ ...credentials, username: 7 }]],
    ["an upper-case username", [{ ...credentials, username: "Alice" }]],
    ["a username shorter than 3", [{ ...credentials, username: "al" }]],
    [
      "a username longer than 32",
      [{ ...credentials, username: "a".repeat(33) }],
    ],
    [
      "a password shorter than 12",
      [{ ...credentials, password: "short pass1" }],
    ],
    [
      "a password longer than 256",
      [{ ...credentials, password: "p".repeat(257) }],
    ],
    [
      "an array instead of credentials",
      [[credentials.username, credentials.password]],
    ],
  ])("refuses %s", (_case, args) => {
    const channel = channelNamed(createAppIpcChannels(fakeActions()), name);

    expect(channel.argumentsMatch(args)).toBe(false);
  });

  it("names the expected credentials, by type only, when it refuses a call", async () => {
    const actions = fakeActions();
    const listener = registeredListener(
      channelNamed(createAppIpcChannels(actions), name),
    );
    const call = listener(appInvocation, { ...credentials, password: "short" });

    await expect(call).rejects.toThrow(
      /received \(object\), expected \(credentials: \{ username: Username, password: Password \}\)/,
    );
    await expect(call).rejects.not.toThrow("short");
    expect(actionOf(actions)).not.toHaveBeenCalled();
  });
});
