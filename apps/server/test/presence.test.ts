import { ServerEnvelope } from "@newcord/shared";
import { Value } from "typebox/value";
import { beforeEach, describe, expect, it } from "vitest";
import { createPresence, type Presence } from "../src/websocket/presence.js";
import {
  createSocketRegistry,
  type SocketRegistry,
} from "../src/websocket/socket-registry.js";
import {
  ALICE_AND_BOB_SHARE_A_GROUP,
  ALICE_LAPTOP,
  ALICE_PHONE,
  BOB_PHONE,
  CAROL_PHONE,
  createFakeHubSocket,
  type FakeHubSocket,
} from "./support/fake-hub-socket.js";
import { presenceChange } from "./support/websocket-test-client.js";

const snapshotOf = (usernames: string[]): object => ({
  v: 1,
  type: "presence",
  kind: "snapshot",
  usernames,
});

let registry: SocketRegistry;
let presence: Presence;
let bob: FakeHubSocket;

beforeEach(() => {
  registry = createSocketRegistry();
  presence = createPresence(registry, ALICE_AND_BOB_SHARE_A_GROUP);
  bob = createFakeHubSocket();
  presence.join(bob, BOB_PHONE);
  bob.sent.length = 0;
});

describe("Presence.join", () => {
  it("registers the socket", () => {
    const phone = createFakeHubSocket();

    presence.join(phone, ALICE_PHONE);

    expect(registry.socketsOfDevice("alice-phone")).toEqual([phone]);
  });

  it("sends the joining socket a snapshot of the online Accounts, its own included", () => {
    const phone = createFakeHubSocket();

    presence.join(phone, ALICE_PHONE);

    expect(phone.sent).toEqual([snapshotOf(["alice", "bob"])]);
    expect(Value.Check(ServerEnvelope, phone.sent[0])).toBe(true);
  });

  it("tells every other socket when an Account's first Device comes online", () => {
    presence.join(createFakeHubSocket(), ALICE_PHONE);

    expect(bob.sent).toEqual([presenceChange("online", "alice")]);
    expect(Value.Check(ServerEnvelope, bob.sent[0])).toBe(true);
  });

  it("says nothing to the others when the Account is already online", () => {
    presence.join(createFakeHubSocket(), ALICE_PHONE);

    presence.join(createFakeHubSocket(), ALICE_LAPTOP);
    presence.join(createFakeHubSocket(), ALICE_PHONE);

    expect(bob.sent).toEqual([presenceChange("online", "alice")]);
  });
});

describe("Presence.leave", () => {
  it("tells the remaining sockets when an Account's last socket leaves", () => {
    const phone = createFakeHubSocket();
    presence.join(phone, ALICE_PHONE);
    bob.sent.length = 0;

    presence.leave(phone);

    expect(bob.sent).toEqual([presenceChange("offline", "alice")]);
    expect(Value.Check(ServerEnvelope, bob.sent[0])).toBe(true);
    expect(phone.sent).toEqual([snapshotOf(["alice", "bob"])]);
  });

  it("says nothing while another Device of the Account is still online", () => {
    const phone = createFakeHubSocket();
    presence.join(phone, ALICE_PHONE);
    presence.join(createFakeHubSocket(), ALICE_LAPTOP);
    bob.sent.length = 0;

    presence.leave(phone);

    expect(bob.sent).toEqual([]);
    expect(registry.isAccountOnline(1)).toBe(true);
  });

  it("does nothing for a socket that never joined or already left", () => {
    const phone = createFakeHubSocket();
    presence.join(phone, ALICE_PHONE);
    presence.leave(phone);
    bob.sent.length = 0;

    presence.leave(phone);
    presence.leave(createFakeHubSocket());

    expect(bob.sent).toEqual([]);
  });
});

describe("the audience of presence (09-m2-build step 7)", () => {
  it("leaves Accounts sharing no Group out of the snapshot", () => {
    presence.join(createFakeHubSocket(), CAROL_PHONE);
    const phone = createFakeHubSocket();

    presence.join(phone, ALICE_PHONE);

    expect(phone.sent).toEqual([snapshotOf(["alice", "bob"])]);
  });

  it("shows an Account sharing no Group only itself", () => {
    const carol = createFakeHubSocket();

    presence.join(carol, CAROL_PHONE);

    expect(carol.sent).toEqual([snapshotOf(["carol"])]);
  });

  it("tells only Accounts sharing a Group when an Account comes online or goes offline", () => {
    const carol = createFakeHubSocket();
    presence.join(carol, CAROL_PHONE);
    carol.sent.length = 0;
    const phone = createFakeHubSocket();

    presence.join(phone, ALICE_PHONE);
    presence.leave(phone);

    expect(carol.sent).toEqual([]);
    expect(bob.sent).toEqual([
      presenceChange("online", "alice"),
      presenceChange("offline", "alice"),
    ]);
  });

  it("resends a fresh snapshot to every socket of the Accounts named", () => {
    const phone = createFakeHubSocket();
    const laptop = createFakeHubSocket();
    presence.join(phone, ALICE_PHONE);
    presence.join(laptop, ALICE_LAPTOP);
    phone.sent.length = 0;
    laptop.sent.length = 0;
    bob.sent.length = 0;

    presence.resendSnapshots([ALICE_PHONE.userId, ALICE_PHONE.userId]);

    expect(phone.sent).toEqual([snapshotOf(["alice", "bob"])]);
    expect(laptop.sent).toEqual([snapshotOf(["alice", "bob"])]);
    expect(bob.sent).toEqual([]);
  });
});
