import { describe, expect, it } from "vitest";
import {
  noticesForCommit,
  type CommitFacts,
} from "../src/main/groups/commit-review";
import type { GroupNotice } from "../src/preload/group-api";

/** A valid identity: the username and a 22-character Device ID built from `device`. */
function identity(username: string, device: string): string {
  return `${username}:${device.padEnd(22, "A")}`;
}
function deviceOf(identityText: string): string {
  return identityText.split(":")[1] ?? "";
}

const alice = identity("alice", "a1");
const bruno = identity("bruno", "b1");
const brunoLaptop = identity("bruno", "b2");
const carla = identity("carla", "c1");

function facts(overrides: Partial<CommitFacts> = {}): CommitFacts {
  return {
    self: carla,
    sender: alice,
    declaredAdded: [],
    declaredRemoved: [],
    realAdded: [],
    realRemoved: [],
    membersAfter: [alice, bruno],
    ...overrides,
  };
}

describe("noticesForCommit", () => {
  it("finds nothing to say about a commit that did what it declared", () => {
    expect(
      noticesForCommit(
        facts({
          declaredAdded: [deviceOf(carla)],
          realAdded: [carla],
          membersAfter: [alice, bruno, carla],
        }),
      ),
    ).toEqual([]);
  });

  it("names the sender and the real change of a commit that added someone it did not declare", () => {
    expect(
      noticesForCommit(
        facts({ realAdded: [carla], membersAfter: [alice, bruno, carla] }),
      ),
    ).toEqual([
      { type: "commit-mismatch", sender: "alice", added: [carla], removed: [] },
    ]);
  });

  it("notices a removal that was not declared, and a declared removal that did not happen", () => {
    expect(
      noticesForCommit(facts({ realRemoved: [bruno], membersAfter: [alice] })),
    ).toHaveLength(1);
    expect(
      noticesForCommit(facts({ declaredRemoved: [deviceOf(bruno)] })),
    ).toEqual([
      { type: "commit-mismatch", sender: "alice", added: [], removed: [] },
    ]);
  });

  it("never trusts an identity not shaped <username>:<deviceId>", () => {
    expect(
      noticesForCommit(
        facts({
          declaredAdded: ["x"],
          realAdded: ["x"],
          membersAfter: [alice, bruno, "x"],
        }),
      ),
    ).toContainEqual(expect.objectContaining({ type: "commit-mismatch" }));
  });

  it("notices a Group of more than 10 people, counting each person once", () => {
    const people = Array.from({ length: 11 }, (_, index) =>
      identity(`person${index}`, `d${index}`),
    );
    const added = people.slice(2);

    const notices = noticesForCommit(
      facts({
        declaredAdded: added.map(deviceOf),
        realAdded: added,
        membersAfter: [...people, identity("person0", "second")],
      }),
    );

    expect(notices).toContainEqual({
      type: "group-over-limit",
      sender: "alice",
      people: 11,
    });
  });

  it("notices a Member's new Device, once per person", () => {
    expect(
      noticesForCommit(
        facts({
          declaredAdded: [deviceOf(brunoLaptop)],
          realAdded: [brunoLaptop],
          membersAfter: [alice, bruno, brunoLaptop],
        }),
      ).filter((notice) => notice.type === "new-device"),
    ).toEqual([{ type: "new-device", username: "bruno" }]);
  });

  it("does not call a newcomer's Devices, or a re-added Device, new", () => {
    expect(
      noticesForCommit(
        facts({
          declaredAdded: [deviceOf(carla)],
          realAdded: [carla],
          membersAfter: [alice, bruno, carla],
        }),
      ),
    ).toEqual([]);
    expect(
      noticesForCommit(
        facts({
          declaredAdded: [deviceOf(bruno)],
          declaredRemoved: [deviceOf(bruno)],
          realAdded: [bruno],
          realRemoved: [bruno],
        }),
      ),
    ).toEqual([]);
  });

  describe("safety number changes (#11)", () => {
    const changed = (username: string): GroupNotice => ({
      type: "safety-number-changed",
      username,
    });

    it("notice a person who stays and gains a Device", () => {
      expect(
        noticesForCommit(
          facts({
            declaredAdded: [deviceOf(brunoLaptop)],
            realAdded: [brunoLaptop],
            membersAfter: [alice, bruno, brunoLaptop],
          }),
        ),
      ).toContainEqual(changed("bruno"));
    });

    it("notice a person who stays and loses a Device", () => {
      expect(
        noticesForCommit(
          facts({
            declaredRemoved: [deviceOf(brunoLaptop)],
            realRemoved: [brunoLaptop],
            membersAfter: [alice, bruno],
          }),
        ),
      ).toEqual([changed("bruno")]);
    });

    it("leave out people who joined or left, resyncs, and this Account", () => {
      const quiet = [
        facts({
          declaredAdded: [deviceOf(carla)],
          realAdded: [carla],
          membersAfter: [alice, bruno, carla],
        }),
        facts({
          declaredRemoved: [deviceOf(bruno)],
          realRemoved: [bruno],
          membersAfter: [alice],
        }),
        facts({
          declaredAdded: [deviceOf(bruno)],
          declaredRemoved: [deviceOf(bruno)],
          realAdded: [bruno],
          realRemoved: [bruno],
        }),
      ];
      for (const commit of quiet) {
        expect(noticesForCommit(commit)).not.toContainEqual(
          expect.objectContaining({ type: "safety-number-changed" }),
        );
      }
      expect(
        noticesForCommit(
          facts({
            self: brunoLaptop,
            declaredAdded: [deviceOf(brunoLaptop)],
            realAdded: [brunoLaptop],
            membersAfter: [alice, bruno, brunoLaptop],
          }),
        ),
      ).not.toContainEqual(changed("bruno"));
    });
  });
});
