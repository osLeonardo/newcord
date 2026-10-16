import { describe, expect, it, vi } from "vitest";
import {
  createDesktopApi,
  type IpcInvoke,
} from "../src/preload/desktop-api-bridge";
import {
  desktopApiChannels,
  type Credentials,
  type DesktopApi,
} from "../src/preload/desktop-api";

const credentials: Credentials = {
  username: "alice",
  password: "correct horse battery staple",
};
const mainProcessAnswer = { answer: "from the main process" };

function invokeAnswering(): ReturnType<typeof vi.fn<IpcInvoke>> {
  return vi.fn<IpcInvoke>(() => Promise.resolve(mainProcessAnswer));
}

describe("createDesktopApi", () => {
  it("gives the interface only the named functions", () => {
    const desktopApi = createDesktopApi(invokeAnswering());

    expect(Object.keys(desktopApi).toSorted()).toEqual(
      Object.keys(desktopApiChannels).toSorted(),
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
  ])(
    "$functionName invokes $channel with no arguments",
    async ({ channel, call }) => {
      const invoke = invokeAnswering();

      await expect(call(createDesktopApi(invoke))).resolves.toBe(
        mainProcessAnswer,
      );
      expect(invoke).toHaveBeenCalledExactlyOnceWith(channel);
    },
  );

  it.each([
    {
      functionName: "signUp",
      channel: desktopApiChannels.signUp,
      call: (api: DesktopApi): Promise<unknown> => api.signUp(credentials),
    },
    {
      functionName: "logIn",
      channel: desktopApiChannels.logIn,
      call: (api: DesktopApi): Promise<unknown> => api.logIn(credentials),
    },
  ])(
    "$functionName invokes $channel with the credentials only",
    async ({ channel, call }) => {
      const invoke = invokeAnswering();

      await expect(call(createDesktopApi(invoke))).resolves.toBe(
        mainProcessAnswer,
      );
      expect(invoke).toHaveBeenCalledExactlyOnceWith(channel, credentials);
    },
  );
});
