import type { MlsEngine, OwnCommit } from "../mls/mls-engine";
import {
  groupIdText,
  payloadBytes,
  payloadText,
  type GroupContext,
} from "./group-context";

/** The Devices a commit declares it adds and removes (D41). */
export interface DeclaredDevices {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/**
 * What became of a commit: the server accepted it and it is merged; another commit won its epoch
 * (it is dropped, and the winner arrives as a delivery); the server refused it; or no answer came.
 */
export type CommitOutcome = "accepted" | "lost-race" | "refused" | "failed";

/** What happened to a request to add an Account's Devices. */
export type AddOutcome = CommitOutcome | "nothing-to-add";

const TRANSPORT_FAILURES: ReadonlySet<string> = new Set([
  "NOT_CONNECTED",
  "CONNECTION_LOST",
  "TIMED_OUT",
]);

/**
 * Makes a commit, saves the state, sends it with its declared change and welcome, then merges it
 * if accepted or drops it otherwise (09-m2-build step 7).
 * @example await commitChange(context, groupId, (engine) => engine.removeMembers(groupId, identities), { added: [], removed });
 */
export async function commitChange(
  context: GroupContext,
  groupId: Uint8Array,
  makeCommit: (engine: MlsEngine) => OwnCommit,
  declared: DeclaredDevices,
): Promise<CommitOutcome> {
  const reply = await context.mls.runThenSend(
    (engine) => ({
      epoch: engine.groupEpoch(groupId),
      own: makeCommit(engine),
    }),
    ({ epoch, own }) =>
      context.requester.request({
        type: "mls.commit",
        groupId: groupIdText(groupId),
        epoch,
        added: [...declared.added],
        removed: [...declared.removed],
        commit: payloadText(own.commit),
        ...(own.welcome === undefined
          ? {}
          : { welcome: payloadText(own.welcome) }),
      }),
  );
  if (reply.ok) {
    context.mls.run((engine) => engine.mergePendingCommit(groupId));
    return "accepted";
  }
  context.mls.run((engine) => engine.clearPendingCommit(groupId));
  if (reply.code === "WRONG_EPOCH") return "lost-race";
  return TRANSPORT_FAILURES.has(reply.code) ? "failed" : "refused";
}

/**
 * Adds every Device of an Account that may join, with one Key package each, in one commit that
 * declares exactly those Devices. Answers "nothing-to-add" once nobody is left to add.
 * @example await addAccount(context, groupId, "bruno");
 */
export async function addAccount(
  context: GroupContext,
  groupId: Uint8Array,
  username: string,
): Promise<AddOutcome> {
  const got = await context.requester.request({
    type: "keypackage.get",
    groupId: groupIdText(groupId),
    username,
  });
  if (!got.ok) {
    return got.code === "NOTHING_TO_ADD" ? "nothing-to-add" : "failed";
  }
  const packages = got.keyPackages ?? [];
  if (packages.length === 0) return "failed";
  const keyPackages = packages.map((entry) => payloadBytes(entry.keyPackage));
  return commitChange(
    context,
    groupId,
    (engine) => engine.addMembers(groupId, keyPackages),
    { added: packages.map((entry) => entry.deviceId), removed: [] },
  );
}
