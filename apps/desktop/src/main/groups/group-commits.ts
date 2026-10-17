import { parseCredentialIdentity } from "../mls/credential-identity";
import type { MlsEngine, OwnCommit } from "../mls/mls-engine";
import type { HubOutcome, HubRequest } from "../hub/hub-requester";
import { recordOwnCommit } from "./commit-notices";
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
  const { reply, membersBefore } = await sendCommit(
    context,
    groupId,
    makeCommit,
    declared,
  );
  if (reply.ok) {
    context.mls.run((engine) => engine.mergePendingCommit(groupId));
    if (reply.seq !== undefined) {
      recordOwnCommit(context, groupId, reply.seq, membersBefore, declared);
    }
    context.events.groupsChanged();
    return "accepted";
  }
  context.mls.run((engine) => engine.clearPendingCommit(groupId));
  if (reply.code === "WRONG_EPOCH") return "lost-race";
  return TRANSPORT_FAILURES.has(reply.code) ? "failed" : "refused";
}

interface PreparedCommit {
  readonly epoch: number;
  readonly membersBefore: readonly string[];
  readonly own: OwnCommit;
}

/** Makes the commit, saves the state, and only then sends it. */
async function sendCommit(
  context: GroupContext,
  groupId: Uint8Array,
  makeCommit: (engine: MlsEngine) => OwnCommit,
  declared: DeclaredDevices,
): Promise<{ reply: HubOutcome; membersBefore: readonly string[] }> {
  let membersBefore: readonly string[] = [];
  const reply = await context.mls.runThenSend(
    (engine): PreparedCommit => ({
      epoch: engine.groupEpoch(groupId),
      membersBefore: engine.groupMembers(groupId),
      own: makeCommit(engine),
    }),
    (prepared) => {
      membersBefore = prepared.membersBefore;
      return context.requester.request(
        commitRequest(groupId, prepared, declared),
      );
    },
  );
  return { reply, membersBefore };
}

function commitRequest(
  groupId: Uint8Array,
  prepared: PreparedCommit,
  declared: DeclaredDevices,
): HubRequest {
  const { own } = prepared;
  return {
    type: "mls.commit",
    groupId: groupIdText(groupId),
    epoch: prepared.epoch,
    added: [...declared.added],
    removed: [...declared.removed],
    commit: payloadText(own.commit),
    ...(own.welcome === undefined ? {} : { welcome: payloadText(own.welcome) }),
  };
}

/**
 * Adds every Device of an Account that may join, with one Key package each, in one commit that
 * declares exactly those Devices. A Device already in the Group (one that needs a resync, D24) is
 * removed and re-added in the same commit. Answers "nothing-to-add" once nobody is left to add.
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
  const added = packages.map((entry) => entry.deviceId);
  const replaced = memberIdentitiesOf(context, groupId, added);
  return commitChange(
    context,
    groupId,
    (engine) =>
      replaced.identities.length === 0
        ? engine.addMembers(groupId, keyPackages)
        : engine.updateMembers(groupId, keyPackages, replaced.identities),
    { added, removed: replaced.deviceIds },
  );
}

/** The identities, and their Device IDs, of the Group's Members among `deviceIds`. */
function memberIdentitiesOf(
  context: GroupContext,
  groupId: Uint8Array,
  deviceIds: readonly string[],
): { identities: string[]; deviceIds: string[] } {
  const members = context.mls
    .read((engine) => engine.groupMembers(groupId))
    .map((identity) => ({
      identity,
      device: parseCredentialIdentity(identity),
    }))
    .filter(
      ({ device }) =>
        device !== undefined && deviceIds.includes(device.deviceId),
    );
  return {
    identities: members.map(({ identity }) => identity),
    deviceIds: members.map(({ device }) => device?.deviceId ?? ""),
  };
}
