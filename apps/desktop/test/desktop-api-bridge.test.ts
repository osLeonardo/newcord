import { describe, expect, it, vi } from "vitest";
import {
  createDesktopApi,
  type IpcInvoke,
  type IpcSubscribe,
} from "../src/preload/desktop-api-bridge";
import {
  desktopApiChannels,
  desktopApiEventChannels,
  type AccountSwitchChoice,
  type Credentials,
  type DesktopApi,
  type Unsubscribe,
} from "../src/preload/desktop-api";

const credentials: Credentials = {
  username: "alice",
  password: "correct horse battery staple",
};
const switchConfirmed: AccountSwitchChoice = { switchAccount: true };
const mainProcessAnswer = { answer: "from the main process" };

function invokeAnswering(): ReturnType<typeof vi.fn<IpcInvoke>> {
  return vi.fn<IpcInvoke>(() => Promise.resolve(mainProcessAnswer));
}

const noSubscriptions: IpcSubscribe = () => () => undefined;

interface RecordedSubscription {
  readonly channel: string;
  readonly deliver: (payload: unknown) => void;
  unsubscribed: boolean;
}

function recordingSubscribe(): {
  subscribe: IpcSubscribe;
  subscriptions: RecordedSubscription[];
} {
  const subscriptions: RecordedSubscription[] = [];
  const subscribe: IpcSubscribe = (channel, listener) => {
    const subscription = { channel, deliver: listener, unsubscribed: false };
    subscriptions.push(subscription);
    return (): void => {
      subscription.unsubscribed = true;
    };
  };
  return { subscribe, subscriptions };
}

describe("createDesktopApi", () => {
  it("gives the interface only the named functions", () => {
    const desktopApi = createDesktopApi(invokeAnswering(), noSubscriptions);

    expect(Object.keys(desktopApi).toSorted()).toEqual(
      [
        ...Object.keys(desktopApiChannels),
        ...Object.keys(desktopApiEventChannels),
      ].toSorted(),
    );
    for (const member of Object.values(desktopApi)) {
      expect(member).toBeTypeOf("function");
    }
  });

  it.each([
    {
      functionName: "readSessionState",
      channel: desktopApiChannels.readSessionState,
      call: (api: DesktopApi): Promise<unknown> => api.readSessionState(),
    },
    {
      functionName: "logOut",
      channel: desktopApiChannels.logOut,
      call: (api: DesktopApi): Promise<unknown> => api.logOut(),
    },
    {
      functionName: "readOnlineAccounts",
      channel: desktopApiChannels.readOnlineAccounts,
      call: (api: DesktopApi): Promise<unknown> => api.readOnlineAccounts(),
    },
    {
      functionName: "listBlocked",
      channel: desktopApiChannels.listBlocked,
      call: (api: DesktopApi): Promise<unknown> => api.listBlocked(),
    },
  ])(
    "$functionName invokes $channel with no arguments",
    async ({ channel, call }) => {
      const invoke = invokeAnswering();

      await expect(
        call(createDesktopApi(invoke, noSubscriptions)),
      ).resolves.toBe(mainProcessAnswer);
      expect(invoke).toHaveBeenCalledExactlyOnceWith(channel);
    },
  );

  it.each([
    {
      functionName: "signUp",
      channel: desktopApiChannels.signUp,
      call: (api: DesktopApi): Promise<unknown> =>
        api.signUp(credentials, switchConfirmed),
    },
    {
      functionName: "logIn",
      channel: desktopApiChannels.logIn,
      call: (api: DesktopApi): Promise<unknown> =>
        api.logIn(credentials, switchConfirmed),
    },
  ])(
    "$functionName invokes $channel with the credentials and the switch choice only",
    async ({ channel, call }) => {
      const invoke = invokeAnswering();

      await expect(
        call(createDesktopApi(invoke, noSubscriptions)),
      ).resolves.toBe(mainProcessAnswer);
      expect(invoke).toHaveBeenCalledExactlyOnceWith(
        channel,
        credentials,
        switchConfirmed,
      );
    },
  );

  it.each([
    {
      functionName: "onSessionChanged",
      channel: desktopApiEventChannels.onSessionChanged,
      payload: { status: "logged-out", username: "alice" },
      listen: (
        api: DesktopApi,
        listener: (payload: unknown) => void,
      ): Unsubscribe => api.onSessionChanged(listener),
    },
    {
      functionName: "onOnlineAccountsChanged",
      channel: desktopApiEventChannels.onOnlineAccountsChanged,
      payload: ["bruno"],
      listen: (
        api: DesktopApi,
        listener: (payload: unknown) => void,
      ): Unsubscribe => api.onOnlineAccountsChanged(listener),
    },
  ])(
    "$functionName hands each payload on $channel to the listener until it unsubscribes",
    ({ channel, payload, listen }) => {
      const { subscribe, subscriptions } = recordingSubscribe();
      const listener = vi.fn();

      const unsubscribe = listen(
        createDesktopApi(invokeAnswering(), subscribe),
        listener,
      );
      subscriptions[0]?.deliver(payload);
      unsubscribe();

      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]?.channel).toBe(channel);
      expect(listener).toHaveBeenCalledExactlyOnceWith(payload);
      expect(subscriptions[0]?.unsubscribed).toBe(true);
    },
  );
});
