import { describe, expect, it, vi, type Mock } from "vitest";
import type { AccountActions } from "../src/main/account/account-actions";
import type { DesktopApiCalls } from "../src/preload/desktop-api";
import { fakeGroupActions } from "./support/fake-group-actions";
import { createAppIpcChannels } from "../src/main/ipc/app-ipc-channels";
import {
  registerCheckedIpcHandler,
  type CheckedIpcChannel,
  type IpcInvocation,
  type IpcInvokeListener,
} from "../src/main/ipc/checked-ipc-handler";
import {
  desktopApiChannels,
  type AccountSwitchChoice,
  type Credentials,
  type LogInResult,
  type PasswordChangeResult,
  type PasswordRecovery,
  type PasswordRecoveryResult,
  type SessionState,
  type SignUpResult,
} from "../src/preload/desktop-api";

const credentials: Credentials = {
  username: "alice_01",
  password: "correct horse battery staple",
};
const choice: AccountSwitchChoice = { switchAccount: false };
const loggedIn: SessionState = { status: "logged-in", username: "alice_01" };
const loggedOut: SessionState = { status: "logged-out", username: "alice_01" };
const signedUp: SignUpResult = {
  outcome: "signed-up",
  recoveryCode: "0123456789ABCDEFGHJKMNPQ",
  session: loggedIn,
};
const logInResult: LogInResult = { outcome: "logged-in", session: loggedIn };
const onlineAccounts = ["bruno", "carla"];
const passwordChanged: PasswordChangeResult = { outcome: "changed" };
const recovered: PasswordRecoveryResult = {
  outcome: "recovered",
  recoveryCode: "0123456789ABCDEFGHJKMNPQ",
  session: loggedOut,
};
const recovery: PasswordRecovery = {
  username: "alice_01",
  recoveryCode: "oi23-4567-89ab-cdef-ghjk-mnpq",
  newPassword: "a brand new long password",
};
const appInvocation: IpcInvocation = {
  sender: { id: 1 },
  senderFrame: { url: "file:///app/index.html", parent: null },
};

type FakeActions = {
  [Name in keyof DesktopApiCalls]: Mock<DesktopApiCalls[Name]>;
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
    changePassword: vi.fn<AccountActions["changePassword"]>(() =>
      Promise.resolve(passwordChanged),
    ),
    recoverPassword: vi.fn<AccountActions["recoverPassword"]>(() =>
      Promise.resolve(recovered),
    ),
    ...fakeGroupActions(),
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
  it("passes the credentials and the switch choice to its action and returns its result", async () => {
    const actions = fakeActions();
    const channel = channelNamed(createAppIpcChannels(actions), name);

    expect(channel.argumentsMatch([credentials, choice])).toBe(true);
    await expect(channel.handle(credentials, choice)).resolves.toEqual(result);
    expect(actionOf(actions)).toHaveBeenCalledExactlyOnceWith(
      credentials,
      choice,
    );
  });

  it.each([
    ["no arguments", []],
    ["no switch choice", [credentials]],
    ["a third argument", [credentials, choice, choice]],
    [
      "a field outside the schema",
      [{ ...credentials, identityKey: "x" }, choice],
    ],
    ["a missing password", [{ username: credentials.username }, choice]],
    [
      "a username that is not a string",
      [{ ...credentials, username: 7 }, choice],
    ],
    ["an upper-case username", [{ ...credentials, username: "Alice" }, choice]],
    ["a username shorter than 3", [{ ...credentials, username: "al" }, choice]],
    [
      "a username longer than 32",
      [{ ...credentials, username: "a".repeat(33) }, choice],
    ],
    [
      "a password shorter than 12",
      [{ ...credentials, password: "short pass1" }, choice],
    ],
    [
      "a password longer than 256",
      [{ ...credentials, password: "p".repeat(257) }, choice],
    ],
    [
      "an array instead of credentials",
      [[credentials.username, credentials.password], choice],
    ],
    [
      "a switch choice that is not a boolean",
      [credentials, { switchAccount: "yes" }],
    ],
    [
      "a switch choice with another field",
      [credentials, { switchAccount: true, wipe: true }],
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
    const call = listener(
      appInvocation,
      { ...credentials, password: "short" },
      choice,
    );

    await expect(call).rejects.toThrow(
      /received \(object, object\), expected \(credentials: \{ username: Username, password: Password \}, choice: \{ switchAccount: boolean \}\)/,
    );
    await expect(call).rejects.not.toThrow("short");
    expect(actionOf(actions)).not.toHaveBeenCalled();
  });
});

describe("the password change channel", () => {
  it("passes the new password to its action", async () => {
    const actions = fakeActions();
    const channel = channelNamed(
      createAppIpcChannels(actions),
      desktopApiChannels.changePassword,
    );

    expect(channel.argumentsMatch([recovery.newPassword])).toBe(true);
    await expect(channel.handle(recovery.newPassword)).resolves.toEqual(
      passwordChanged,
    );
    expect(actions.changePassword).toHaveBeenCalledExactlyOnceWith(
      recovery.newPassword,
    );
  });

  it.each([
    ["no arguments", []],
    ["a password shorter than 12", ["short pass1"]],
    ["a password longer than 256", ["p".repeat(257)]],
    ["an object", [{ newPassword: recovery.newPassword }]],
    ["a second argument", [recovery.newPassword, recovery.newPassword]],
  ])("refuses %s", (_case, args) => {
    const channel = channelNamed(
      createAppIpcChannels(fakeActions()),
      desktopApiChannels.changePassword,
    );

    expect(channel.argumentsMatch(args)).toBe(false);
  });
});

describe("the password recovery channel", () => {
  it("passes the recovery, with the code as typed, to its action", async () => {
    const actions = fakeActions();
    const channel = channelNamed(
      createAppIpcChannels(actions),
      desktopApiChannels.recoverPassword,
    );

    expect(channel.argumentsMatch([recovery])).toBe(true);
    await expect(channel.handle(recovery)).resolves.toEqual(recovered);
    expect(actions.recoverPassword).toHaveBeenCalledExactlyOnceWith(recovery);
  });

  it.each([
    ["no arguments", []],
    ["a code with too few symbols", [{ ...recovery, recoveryCode: "0123" }]],
    ["a code with a U", [{ ...recovery, recoveryCode: "U".repeat(24) }]],
    ["an invalid username", [{ ...recovery, username: "Alice" }]],
    ["a short new password", [{ ...recovery, newPassword: "short pass1" }]],
    ["a field outside the schema", [{ ...recovery, password: "x" }]],
  ])("refuses %s", (_case, args) => {
    const channel = channelNamed(
      createAppIpcChannels(fakeActions()),
      desktopApiChannels.recoverPassword,
    );

    expect(channel.argumentsMatch(args)).toBe(false);
  });
});
