import { randomBytes } from "node:crypto";
import type {
  IncomingMls,
  MlsEngine,
  OwnCommit,
} from "../../src/main/mls/mls-engine";

/**
 * A stand-in for `@newcord/mls` until #4 builds it: no cryptography, but the same rules about
 * epochs and membership. A Device reads a message only while a Member at its epoch (or the one
 * before), joins only from a welcome naming it, and applies a commit only in step with its Group.
 */

interface FakeGroup {
  epoch: number;
  members: string[];
  pending?: { members: string[] };
  proposals: string[];
}

interface FakeState {
  identity?: string;
  groups: Map<string, FakeGroup>;
}

interface SavedFakeState {
  identity?: string;
  groups: [string, FakeGroup][];
}

type FakeWire =
  | { t: "kp"; identity: string; id: string }
  | {
      t: "commit";
      group: string;
      fromEpoch: number;
      sender: string;
      members: string[];
    }
  | {
      t: "welcome";
      group: string;
      epoch: number;
      members: string[];
      added: string[];
    }
  | {
      t: "proposal";
      group: string;
      epoch: number;
      sender: string;
      removes: string[];
    }
  | {
      t: "message";
      group: string;
      epoch: number;
      sender: string;
      data: string;
    };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encodes a fake MLS object; tests use it to forge commits that break their declaration (D71). */
export function encodeFakeMls(wire: FakeWire): Uint8Array {
  return encoder.encode(JSON.stringify(wire));
}

function decodeFakeMls(bytes: Uint8Array): FakeWire {
  return JSON.parse(decoder.decode(bytes)) as FakeWire;
}

const hex = (groupId: Uint8Array): string =>
  Buffer.from(groupId).toString("hex");

/** Creates a fresh fake engine, as loading the module gives a fresh instance. */
export function createFakeMlsEngine(): MlsEngine {
  let state: FakeState = { groups: new Map() };
  const self = (): string => {
    if (state.identity === undefined)
      throw new Error("initIdentity or loadState first");
    return state.identity;
  };
  const groupOf = (groupId: string): FakeGroup => {
    const group = state.groups.get(groupId);
    if (group === undefined) throw new Error(`not in group ${groupId}`);
    return group;
  };
  const ownCommit = (
    groupId: string,
    members: string[],
    added: string[],
  ): OwnCommit => {
    const group = groupOf(groupId);
    group.pending = { members };
    const commit = encodeFakeMls({
      t: "commit",
      group: groupId,
      fromEpoch: group.epoch,
      sender: self(),
      members,
    });
    if (added.length === 0) return { commit };
    const welcome = encodeFakeMls({
      t: "welcome",
      group: groupId,
      epoch: group.epoch + 1,
      members,
      added,
    });
    return { commit, welcome };
  };
  const identitiesOf = (keyPackages: readonly Uint8Array[]): string[] =>
    keyPackages.map((keyPackage) => {
      const wire = decodeFakeMls(keyPackage);
      if (wire.t !== "kp") throw new Error("not a key package");
      return wire.identity;
    });
  return {
    loadState: (blob): void => {
      const saved = JSON.parse(decoder.decode(blob)) as SavedFakeState;
      state = { ...saved, groups: new Map(saved.groups) };
    },
    saveState: (): Uint8Array =>
      encoder.encode(JSON.stringify({ ...state, groups: [...state.groups] })),
    initIdentity: (_privateKey, _publicKey, username, deviceId): void => {
      state = { identity: `${username}:${deviceId}`, groups: new Map() };
    },
    createKeyPackages: (count): Uint8Array[] =>
      Array.from({ length: count }, () =>
        encodeFakeMls({
          t: "kp",
          identity: self(),
          id: randomBytes(8).toString("hex"),
        }),
      ),
    createGroup: (groupId): void => {
      state.groups.set(hex(groupId), {
        epoch: 0,
        members: [self()],
        proposals: [],
      });
    },
    addMembers: (groupId, keyPackages): OwnCommit => {
      const added = identitiesOf(keyPackages);
      const members = groupOf(hex(groupId)).members;
      return ownCommit(hex(groupId), [...members, ...added], added);
    },
    removeMembers: (groupId, identities): OwnCommit => {
      const members = groupOf(hex(groupId)).members;
      return ownCommit(
        hex(groupId),
        members.filter((m) => !identities.includes(m)),
        [],
      );
    },
    updateMembers: (groupId, keyPackages, identities): OwnCommit => {
      const added = identitiesOf(keyPackages);
      const kept = groupOf(hex(groupId)).members.filter(
        (m) => !identities.includes(m),
      );
      return ownCommit(hex(groupId), [...kept, ...added], added);
    },
    leaveGroup: (groupId): Uint8Array => {
      const group = groupOf(hex(groupId));
      return encodeFakeMls({
        t: "proposal",
        group: hex(groupId),
        epoch: group.epoch,
        sender: self(),
        removes: [self()],
      });
    },
    commitPendingProposals: (groupId): OwnCommit => {
      const group = groupOf(hex(groupId));
      const members = group.members.filter((m) => !group.proposals.includes(m));
      return ownCommit(hex(groupId), members, []);
    },
    joinFromWelcome: (welcome): Uint8Array => {
      const wire = decodeFakeMls(welcome);
      if (wire.t !== "welcome" || !wire.added.includes(self())) {
        throw new Error("this welcome is not for this Device");
      }
      state.groups.set(wire.group, {
        epoch: wire.epoch,
        members: wire.members,
        proposals: [],
      });
      return Buffer.from(wire.group, "hex");
    },
    encrypt: (groupId, plaintext): Uint8Array => {
      const group = groupOf(hex(groupId));
      return encodeFakeMls({
        t: "message",
        group: hex(groupId),
        epoch: group.epoch,
        sender: self(),
        data: Buffer.from(plaintext).toString("base64"),
      });
    },
    processIncoming: (message): IncomingMls =>
      processFakeIncoming(state, self(), decodeFakeMls(message)),
    mergePendingCommit: (groupId): void => {
      const group = groupOf(hex(groupId));
      if (group.pending === undefined) throw new Error("no pending commit");
      group.members = group.pending.members;
      group.epoch += 1;
      group.proposals = [];
      delete group.pending;
    },
    clearPendingCommit: (groupId): void => {
      delete groupOf(hex(groupId)).pending;
    },
    groupEpoch: (groupId): number => groupOf(hex(groupId)).epoch,
    groupMembers: (groupId): string[] => [...groupOf(hex(groupId)).members],
  };
}

function processFakeIncoming(
  state: FakeState,
  self: string,
  wire: FakeWire,
): IncomingMls {
  if (wire.t === "kp" || wire.t === "welcome")
    throw new Error(`cannot process a ${wire.t}`);
  const group = state.groups.get(wire.group);
  if (group === undefined || !group.members.includes(self)) {
    throw new Error("not a member of this group");
  }
  const groupId = Buffer.from(wire.group, "hex");
  if (wire.t === "message") {
    // Like OpenMLS with one past epoch kept: a message sent just before a commit still opens.
    if (wire.epoch !== group.epoch && wire.epoch !== group.epoch - 1) {
      throw new Error(
        `cannot decrypt epoch ${wire.epoch} at epoch ${group.epoch}`,
      );
    }
    return {
      kind: "message",
      groupId,
      sender: wire.sender,
      plaintext: Buffer.from(wire.data, "base64"),
    };
  }
  if (wire.t === "proposal") {
    group.proposals.push(...wire.removes);
    return {
      kind: "proposal",
      groupId,
      sender: wire.sender,
      removes: wire.removes,
    };
  }
  return applyFakeCommit(state, self, wire, groupId);
}

function applyFakeCommit(
  state: FakeState,
  self: string,
  wire: Extract<FakeWire, { t: "commit" }>,
  groupId: Uint8Array,
): IncomingMls {
  const group = state.groups.get(wire.group);
  if (group === undefined || wire.fromEpoch !== group.epoch) {
    throw new Error(
      `commit from epoch ${wire.fromEpoch} does not follow this group's state`,
    );
  }
  const before = group.members;
  const added = wire.members.filter((m) => !before.includes(m));
  const removed = before.filter((m) => !wire.members.includes(m));
  group.members = wire.members;
  group.epoch += 1;
  group.proposals = [];
  delete group.pending;
  if (!wire.members.includes(self)) state.groups.delete(wire.group);
  return {
    kind: "commit",
    groupId,
    sender: wire.sender,
    added,
    removed,
    epoch: group.epoch,
  };
}
