import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createdGroup,
  deviceIdOf,
  groupNames,
  hubOf,
  identityOf,
  inviteAndJoin,
  memberReady,
  mlsView,
  secondDevice,
  serverGroup,
  waitUntilInGroup,
  WAIT,
} from "./support/group-scenarios";
import type { AccountHub } from "../src/main/hub/account-hub";
import type { HubOutcome } from "../src/main/hub/hub-requester";
import {
  startInProcessServer,
  type InProcessServer,
} from "./support/in-process-server";
import {
  createLiveInstallations,
  type LiveInstallations,
} from "./support/live-installations";

/** Collects the replies to the hub's `mls.commit` requests from now on. */
function recordCommitReplies(hub: AccountHub): Promise<HubOutcome>[] {
  const replies: Promise<HubOutcome>[] = [];
  const request = hub.requester.request.bind(hub.requester);
  vi.spyOn(hub.requester, "request").mockImplementation((envelope) => {
    const reply = request(envelope);
    if (envelope.type === "mls.commit") replies.push(reply);
    return reply;
  });
  return replies;
}

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

describe("creating a Group (#6, Step 02)", () => {
  it("creates the MLS Group, registers it with the server and lists it", async () => {
    const alice = await memberReady(server, installations, "alice");

    const groupId = await createdGroup(alice, "friends");

    expect(await groupNames(alice)).toEqual(["friends"]);
    expect(serverGroup(server, groupId)).toEqual({
      epoch: 0,
      members: [deviceIdOf(alice)],
    });
    expect(await mlsView(alice, groupId)).toEqual({
      epoch: 0,
      members: [identityOf(alice)],
    });
  });

  it.each(["", "n".repeat(65)])(
    "refuses the name %j before sending anything",
    async (name) => {
      const alice = await memberReady(server, installations, "alice");

      const result = await (await hubOf(alice)).groups.createGroup(name);

      expect(result).toEqual({ outcome: "refused", refusal: "INVALID_NAME" });
      expect(
        server.database.prepare("SELECT count(*) FROM groups").pluck().get(),
      ).toBe(0);
    },
  );
});

describe("Invitations and additions (#6, Step 02)", () => {
  it("adds every Device of an invitee who accepts in one commit, and the invitee joins from the welcome", async () => {
    const alice = await memberReady(server, installations, "alice");
    const brunoPhone = await memberReady(server, installations, "bruno");
    const brunoLaptop = await secondDevice(server, installations, "bruno");
    const groupId = await createdGroup(alice);

    await inviteAndJoin(alice, brunoPhone, groupId, "bruno");
    await waitUntilInGroup(brunoLaptop, groupId);

    expect(await groupNames(brunoLaptop)).toEqual(["friends"]);
    const expected = {
      epoch: 1,
      members: [
        identityOf(alice),
        identityOf(brunoPhone),
        identityOf(brunoLaptop),
      ].sort(),
    };
    for (const installation of [alice, brunoPhone, brunoLaptop]) {
      expect(await mlsView(installation, groupId)).toEqual(expected);
    }
    expect(serverGroup(server, groupId).epoch).toBe(1);
    expect(alice.hubErrors).toEqual([]);
  });

  it("shows the invitee the Group's name and the inviter, and declining sends no one in", async () => {
    const alice = await memberReady(server, installations, "alice");
    const bruno = await memberReady(server, installations, "bruno");
    const groupId = await createdGroup(alice, "board games");
    await (await hubOf(alice)).groups.inviteToGroup(groupId, "bruno");
    const brunoHub = await hubOf(bruno);

    const pending = await vi.waitFor(async () => {
      const invitations = await brunoHub.groups.listInvitations();
      expect(invitations).toHaveLength(1);
      return invitations;
    }, WAIT);
    expect(pending[0]).toMatchObject({
      groupId,
      groupName: "board games",
      from: "alice",
    });
    const declined = await brunoHub.groups.answerInvitation(
      pending[0]?.invitationId ?? "",
      false,
    );

    expect(declined).toEqual({ outcome: "done" });
    expect(await brunoHub.groups.listInvitations()).toEqual([]);
    expect(serverGroup(server, groupId).members).toEqual([deviceIdOf(alice)]);
  });

  it("ends with one addition when two Members handle the same acceptance at once", async () => {
    const alice = await memberReady(server, installations, "alice");
    const carla = await memberReady(server, installations, "carla");
    const dora = await memberReady(server, installations, "dora");
    const groupId = await createdGroup(alice);
    await inviteAndJoin(alice, carla, groupId, "carla");
    const aliceCommits = recordCommitReplies(await hubOf(alice));
    const carlaCommits = recordCommitReplies(await hubOf(carla));

    await inviteAndJoin(carla, dora, groupId, "dora");

    await vi.waitFor(async () => {
      for (const installation of [alice, carla, dora]) {
        expect(await mlsView(installation, groupId)).toEqual({
          epoch: 2,
          members: [
            identityOf(alice),
            identityOf(carla),
            identityOf(dora),
          ].sort(),
        });
      }
    }, WAIT);
    expect(serverGroup(server, groupId).epoch).toBe(2);
    expect([...alice.hubErrors, ...carla.hubErrors, ...dora.hubErrors]).toEqual(
      [],
    );
    const outcomes = await Promise.all([...aliceCommits, ...carlaCommits]);
    expect(outcomes.filter((reply) => reply.ok)).toHaveLength(1);
    expect(outcomes.filter((reply) => !reply.ok)).toEqual([
      { ok: false, code: "WRONG_EPOCH" },
    ]);
  });
});
