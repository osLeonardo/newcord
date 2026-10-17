import { describe, expect, it } from "vitest";
import { createGroupLanes } from "../src/main/groups/group-lanes";
import { settlePromises } from "./support/manual-clock";

const friends = new Uint8Array(16).fill(1);
const family = new Uint8Array(16).fill(2);

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe("createGroupLanes", () => {
  it("runs a Group's tasks one after another, in order", async () => {
    const lanes = createGroupLanes();
    const order: string[] = [];
    const first = deferred();

    const one = lanes.run(friends, async () => {
      order.push("first started");
      await first.promise;
      order.push("first done");
    });
    const two = lanes.run(friends, () => {
      order.push("second");
      return Promise.resolve();
    });
    await settlePromises();
    first.resolve();
    await Promise.all([one, two]);

    expect(order).toEqual(["first started", "first done", "second"]);
  });

  it("runs different Groups' tasks side by side", async () => {
    const lanes = createGroupLanes();
    const blocker = deferred();
    void lanes.run(friends, () => blocker.promise);

    await expect(
      lanes.run(family, () => Promise.resolve("done")),
    ).resolves.toBe("done");
    blocker.resolve();
  });

  it("keeps going after a task fails, and reports the failure to its caller", async () => {
    const lanes = createGroupLanes();

    const failed = lanes.run(friends, () =>
      Promise.reject(new Error("broken")),
    );
    const after = lanes.run(friends, () => Promise.resolve("still runs"));

    await expect(failed).rejects.toThrow("broken");
    await expect(after).resolves.toBe("still runs");
  });
});
