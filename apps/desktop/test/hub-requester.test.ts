import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createHubRequester,
  HUB_REQUEST_TIMEOUT_MS,
  type HubRequester,
} from "../src/main/hub/hub-requester";
import { createManualClock, type ManualClock } from "./support/manual-clock";

const groupId = "MgZoqEdt4EEfhsMd_7xNqw";

let clock: ManualClock;
let sent: object[];
let connected: boolean;
let requester: HubRequester;
let nextId: number;

beforeEach(() => {
  clock = createManualClock();
  sent = [];
  connected = true;
  nextId = 0;
  requester = createHubRequester({
    send: (envelope): boolean => {
      if (!connected) return false;
      sent.push(envelope);
      return true;
    },
    clock,
    newRequestId: (): string => `r-${(nextId += 1)}`,
  });
});

afterEach(() => {
  requester.connectionLost();
});

describe("createHubRequester", () => {
  it("sends the request with the protocol version and a request ID", () => {
    void requester.request({ type: "group.create", groupId, name: "friends" });

    expect(sent).toEqual([
      {
        v: 1,
        requestId: "r-1",
        type: "group.create",
        groupId,
        name: "friends",
      },
    ]);
  });

  it("answers with the matching reply, without its Envelope fields", async () => {
    const first = requester.request({ type: "block", username: "bruno" });
    const second = requester.request({ type: "block", username: "carla" });

    requester.replyReceived({
      v: 1,
      type: "reply",
      requestId: "r-2",
      ok: true,
      seq: 4,
    });
    requester.replyReceived({
      v: 1,
      type: "reply",
      requestId: "r-1",
      ok: false,
      code: "ACCOUNT_NOT_FOUND",
    });

    await expect(second).resolves.toEqual({ ok: true, seq: 4 });
    await expect(first).resolves.toEqual({
      ok: false,
      code: "ACCOUNT_NOT_FOUND",
    });
  });

  it("ignores a reply nobody waits for", () => {
    expect(() =>
      requester.replyReceived({
        v: 1,
        type: "reply",
        requestId: "r-9",
        ok: true,
      }),
    ).not.toThrow();
  });

  it("answers at once when there is no connection", async () => {
    connected = false;

    await expect(
      requester.request({ type: "block", username: "bruno" }),
    ).resolves.toEqual({ ok: false, code: "NOT_CONNECTED" });
  });

  it("answers every waiting request when the connection is lost", async () => {
    const waiting = requester.request({ type: "block", username: "bruno" });

    requester.connectionLost();

    await expect(waiting).resolves.toEqual({
      ok: false,
      code: "CONNECTION_LOST",
    });
  });

  it("gives up on a reply after 30 seconds", async () => {
    const waiting = requester.request({ type: "block", username: "bruno" });

    await clock.advance(HUB_REQUEST_TIMEOUT_MS);

    await expect(waiting).resolves.toEqual({ ok: false, code: "TIMED_OUT" });
  });
});
