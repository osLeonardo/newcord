import type { CallSignal } from "@newcord/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceivedCallSignal } from "../src/preload/call-api";
import { desktopApiEventChannels } from "../src/preload/desktop-api";
import {
  createdGroup,
  deviceIdOf,
  hubOf,
  inviteAndJoin,
  memberReady,
  secondDevice,
  waitUntilInGroup,
  WAIT,
} from "./support/group-scenarios";
import {
  startInProcessServer,
  type InProcessServer,
} from "./support/in-process-server";
import {
  createLiveInstallations,
  type LiveInstallation,
  type LiveInstallations,
} from "./support/live-installations";

let server: InProcessServer;
let installations: LiveInstallations;

beforeEach(async () => {
  server = await startInProcessServer();
  installations = createLiveInstallations(server);
});

afterEach(async () => {
  await installations.close();
  await server.close();
});

const offer: CallSignal = { kind: "description", type: "offer", sdp: "v=0" };

/** People sharing one Group, the first one its creator. */
async function friendsInAGroup(
  usernames: string[],
): Promise<{ groupId: string; devices: LiveInstallation[] }> {
  const devices: LiveInstallation[] = [];
  for (const username of usernames) {
    devices.push(await memberReady(server, installations, username));
  }
  const [creator, ...others] = devices;
  if (creator === undefined) throw new Error("no creator");
  const groupId = await createdGroup(creator);
  for (const [index, other] of others.entries()) {
    await inviteAndJoin(creator, other, groupId, usernames[index + 1] ?? "");
  }
  return { groupId, devices };
}

async function participantsSeenBy(
  installation: LiveInstallation,
  groupId: string,
): Promise<string[]> {
  const call = await (await hubOf(installation)).calls.readCall(groupId);
  return call.participants.map((participant) => participant.username);
}

async function join(
  installation: LiveInstallation,
  groupId: string,
): Promise<void> {
  const result = await (await hubOf(installation)).calls.joinCall(groupId);
  expect(result.outcome).toBe("joined");
}

function signalsReceivedBy(
  installation: LiveInstallation,
): ReceivedCallSignal[] {
  return installation.notifications
    .filter((change) => change.channel === desktopApiEventChannels.onCallSignal)
    .map((change) => change.payload as ReceivedCallSignal);
}

function messagesSentBy(installation: LiveInstallation): number {
  return server.database
    .prepare("SELECT count(*) FROM messages WHERE sender = ?")
    .pluck()
    .get(deviceIdOf(installation)) as number;
}

describe("joining and leaving a Call (#9, Step 01)", () => {
  it("tells every Member who joined, through an MLS message the server cannot tell from chat", async () => {
    const {
      groupId,
      devices: [alice, bruno, carla],
    } = await friendsInAGroup(["alice", "bruno", "carla"]);
    if (alice === undefined || bruno === undefined || carla === undefined) {
      throw new Error("missing Device");
    }
    await carla.liveSession.stop();

    await join(alice, groupId);

    await vi.waitFor(async () => {
      expect(await participantsSeenBy(bruno, groupId)).toEqual(["alice"]);
    }, WAIT);
    expect(await participantsSeenBy(alice, groupId)).toEqual(["alice"]);
    const kinds = server.database
      .prepare(
        "SELECT kind FROM messages WHERE sender = ? ORDER BY seq DESC LIMIT 1",
      )
      .pluck()
      .all(deviceIdOf(alice));
    expect(kinds).toEqual(["message"]);
  });

  it("drops a Participant who leaves, and refuses their signals afterwards", async () => {
    const {
      groupId,
      devices: [alice, bruno],
    } = await friendsInAGroup(["alice", "bruno"]);
    if (alice === undefined || bruno === undefined) throw new Error("missing");
    await join(alice, groupId);
    await vi.waitFor(async () => {
      expect(await participantsSeenBy(bruno, groupId)).toEqual(["alice"]);
    }, WAIT);

    const left = await (await hubOf(alice)).calls.leaveCall(groupId);

    expect(left).toEqual({ outcome: "done" });
    await vi.waitFor(async () => {
      expect(await participantsSeenBy(bruno, groupId)).toEqual([]);
    }, WAIT);
    expect(
      await (
        await hubOf(alice)
      ).calls.sendCallSignal(groupId, deviceIdOf(bruno), offer),
    ).toEqual({ outcome: "refused", refusal: "NOT_IN_CALL" });
  });

  it("leaves one Group's Call before joining another's", async () => {
    const {
      groupId: first,
      devices: [alice, bruno],
    } = await friendsInAGroup(["alice", "bruno"]);
    if (alice === undefined || bruno === undefined) throw new Error("missing");
    const second = await createdGroup(alice, "second");
    await join(alice, first);

    await join(alice, second);

    expect((await (await hubOf(alice)).calls.readCall(first)).joined).toBe(
      false,
    );
    expect((await (await hubOf(alice)).calls.readCall(second)).joined).toBe(
      true,
    );
    await vi.waitFor(async () => {
      expect(await participantsSeenBy(bruno, first)).toEqual([]);
    }, WAIT);
  });
});

describe("Call signals (D18)", () => {
  it("reach only the Device they name, while it is in the Call", async () => {
    const {
      groupId,
      devices: [alice, bruno, carla],
    } = await friendsInAGroup(["alice", "bruno", "carla"]);
    if (alice === undefined || bruno === undefined || carla === undefined) {
      throw new Error("missing Device");
    }
    await join(alice, groupId);
    await join(bruno, groupId);

    const sent = await (
      await hubOf(alice)
    ).calls.sendCallSignal(groupId, deviceIdOf(bruno), offer);

    expect(sent).toEqual({ outcome: "done" });
    await vi.waitFor(() => {
      expect(signalsReceivedBy(bruno)).toEqual([
        { groupId, from: deviceIdOf(alice), signal: offer },
      ]);
    }, WAIT);
    await join(carla, groupId);
    expect(signalsReceivedBy(carla)).toEqual([]);
  });

  it("let a joiner hear of someone already in the Call through their signal", async () => {
    const {
      groupId,
      devices: [alice, bruno],
    } = await friendsInAGroup(["alice", "bruno"]);
    if (alice === undefined || bruno === undefined) throw new Error("missing");
    await bruno.liveSession.stop();
    await join(alice, groupId);
    // Bruno comes back more than a minute later: alice's join is stale for him (#9's spec).
    await alice.clock.advance(61_000);
    await bruno.clock.advance(61_000);
    bruno.liveSession.start();
    await vi.waitFor(async () => {
      await join(bruno, groupId);
    }, WAIT);
    expect(await participantsSeenBy(bruno, groupId)).toEqual(["bruno"]);

    await (
      await hubOf(alice)
    ).calls.sendCallSignal(groupId, deviceIdOf(bruno), offer);

    await vi.waitFor(async () => {
      expect(await participantsSeenBy(bruno, groupId)).toEqual([
        "bruno",
        "alice",
      ]);
    }, WAIT);
    expect(signalsReceivedBy(bruno)).toHaveLength(1);
  });
});

describe("the call-full rule (D2)", () => {
  it("refuses a seventh joiner, who sends nothing", async () => {
    // Four Accounts, three of them on two Devices: Participants are Devices.
    const { groupId, devices: phones } = await friendsInAGroup([
      "alice",
      "bruno",
      "carla",
      "diego",
    ]);
    const laptops: LiveInstallation[] = [];
    for (const username of ["alice", "bruno", "carla"]) {
      const laptop = await secondDevice(server, installations, username);
      await waitUntilInGroup(laptop, groupId);
      laptops.push(laptop);
    }
    const devices = [...phones, ...laptops];
    const seventh = devices[6];
    if (seventh === undefined) throw new Error("missing Device");
    for (const device of devices.slice(0, 6)) await join(device, groupId);
    await vi.waitFor(async () => {
      expect(await participantsSeenBy(seventh, groupId)).toHaveLength(6);
    }, WAIT);
    const sentBefore = messagesSentBy(seventh);

    const call = await (await hubOf(seventh)).calls.readCall(groupId);
    const result = await (await hubOf(seventh)).calls.joinCall(groupId);

    expect(call.full).toBe(true);
    expect(result).toEqual({ outcome: "refused", refusal: "CALL_FULL" });
    expect(messagesSentBy(seventh)).toBe(sentBefore);
  }, 30_000);
});

describe("dropping Participants (#9's spec)", () => {
  it("drops the Devices of an Account that went offline", async () => {
    const {
      groupId,
      devices: [alice, bruno],
    } = await friendsInAGroup(["alice", "bruno"]);
    if (alice === undefined || bruno === undefined) throw new Error("missing");
    await join(bruno, groupId);
    await vi.waitFor(async () => {
      expect(await participantsSeenBy(alice, groupId)).toEqual(["bruno"]);
    }, WAIT);

    // The in-process server hears a test socket close only after ws's 30-second close timeout,
    // so the presence change it would send is handed to the hub directly.
    alice.deviceHub.onlineAccountsChanged([]);

    expect(await participantsSeenBy(alice, groupId)).toEqual([]);
  });

  it("drops a Participant the window could not connect to", async () => {
    const {
      groupId,
      devices: [alice, bruno],
    } = await friendsInAGroup(["alice", "bruno"]);
    if (alice === undefined || bruno === undefined) throw new Error("missing");
    await join(bruno, groupId);
    await vi.waitFor(async () => {
      expect(await participantsSeenBy(alice, groupId)).toEqual(["bruno"]);
    }, WAIT);

    await (
      await hubOf(alice)
    ).calls.dropCallParticipant(groupId, deviceIdOf(bruno));

    expect(await participantsSeenBy(alice, groupId)).toEqual([]);
  });

  it("hangs up when this Device is removed from the Group", async () => {
    const {
      groupId,
      devices: [alice, bruno],
    } = await friendsInAGroup(["alice", "bruno"]);
    if (alice === undefined || bruno === undefined) throw new Error("missing");
    await join(bruno, groupId);

    await (await hubOf(alice)).groups.removeMember(groupId, "bruno");

    await vi.waitFor(async () => {
      expect((await (await hubOf(bruno)).calls.readCall(groupId)).joined).toBe(
        false,
      );
    }, WAIT);
  });
});

describe("the relay (#9, Step 02)", () => {
  it("gives each Call fresh relay passwords for the app's own relay only", async () => {
    const alice = await memberReady(server, installations, "alice");

    const result = await (await hubOf(alice)).calls.readIceConfiguration();

    expect(result).toEqual({
      outcome: "ready",
      configuration: {
        iceServers: [
          { urls: ["stun:relay.test:3478"] },
          {
            urls: ["turn:relay.test:3478"],
            username: expect.stringContaining(
              `:${deviceIdOf(alice)}`,
            ) as unknown,
            credential: expect.any(String) as unknown,
          },
        ],
        iceTransportPolicy: "all",
      },
    });
  });

  it("forces relayed connections once Hide my IP is on", async () => {
    const alice = await memberReady(server, installations, "alice");

    const settings = await alice.actions.changeCallSettings({ hideMyIp: true });
    const result = await (await hubOf(alice)).calls.readIceConfiguration();

    expect(settings).toMatchObject({ hideMyIp: true });
    expect(
      result.outcome === "ready" && result.configuration.iceTransportPolicy,
    ).toBe("relay");
  });
});
