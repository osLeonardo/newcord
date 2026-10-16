/** Runs each Group's MLS work one task at a time, in the order it was asked for. */
export interface GroupLanes {
  run<Result>(
    groupId: Uint8Array,
    task: () => Promise<Result>,
  ): Promise<Result>;
}

/**
 * Creates the lanes. A commit waiting for the server's answer must not interleave with the
 * Group's incoming deliveries, or the MLS state would apply them out of order.
 * @example await lanes.run(groupId, () => processDelivery(delivery));
 */
export function createGroupLanes(): GroupLanes {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run: <Result>(
      groupId: Uint8Array,
      task: () => Promise<Result>,
    ): Promise<Result> => {
      const key = Buffer.from(groupId).toString("hex");
      const previous = tails.get(key) ?? Promise.resolve();
      const next = previous.then(task, task);
      const tail = next.catch(() => undefined);
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return next;
    },
  };
}
