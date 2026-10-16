/** A commit this Device made, waiting for the server to accept it before it is merged. */
export interface OwnCommit {
  readonly commit: Uint8Array;
  /** Present when the commit adds Devices: it lets them join. */
  readonly welcome?: Uint8Array;
}

/** What `processIncoming` found in an MLS message from another Device. */
export type IncomingMls =
  | {
      readonly kind: "message";
      readonly groupId: Uint8Array;
      readonly sender: string;
      readonly plaintext: Uint8Array;
    }
  | {
      readonly kind: "commit";
      readonly groupId: Uint8Array;
      readonly sender: string;
      /** The identities the commit really added and removed, whatever its sender declared (D41). */
      readonly added: readonly string[];
      readonly removed: readonly string[];
      readonly epoch: number;
    }
  | {
      readonly kind: "proposal";
      readonly groupId: Uint8Array;
      readonly sender: string;
      /** The identities the proposal asks to remove: the sender's own, for a leave request (D57). */
      readonly removes: readonly string[];
    };

/**
 * The MLS operations the main process uses, as `@newcord/mls` (#4) provides them over OpenMLS with
 * cipher suite 1. Identities are credential identities, `<username>:<deviceId>` (D70). Every call
 * changes the state blob, which the caller saves before sending anything (D39).
 * `groupEpoch` and `groupMembers` go beyond #4's API table; #6 needs them for declared epochs and the member list.
 */
export interface MlsEngine {
  loadState(state: Uint8Array): void;
  saveState(): Uint8Array;
  initIdentity(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
    username: string,
    deviceId: string,
  ): void;
  /** Returns `count` Key packages, the last one last-resort when asked. */
  createKeyPackages(count: number, lastResort: boolean): Uint8Array[];
  createGroup(groupId: Uint8Array): void;
  addMembers(
    groupId: Uint8Array,
    keyPackages: readonly Uint8Array[],
  ): OwnCommit;
  removeMembers(groupId: Uint8Array, identities: readonly string[]): OwnCommit;
  /** Removes and adds in one commit, as a resync needs (D24). */
  updateMembers(
    groupId: Uint8Array,
    keyPackages: readonly Uint8Array[],
    identities: readonly string[],
  ): OwnCommit;
  /** Returns this Device's request to be removed (D57). */
  leaveGroup(groupId: Uint8Array): Uint8Array;
  commitPendingProposals(groupId: Uint8Array): OwnCommit;
  /** Joins a Group from a welcome and returns its ID. */
  joinFromWelcome(welcome: Uint8Array): Uint8Array;
  encrypt(groupId: Uint8Array, plaintext: Uint8Array): Uint8Array;
  processIncoming(message: Uint8Array): IncomingMls;
  mergePendingCommit(groupId: Uint8Array): void;
  clearPendingCommit(groupId: Uint8Array): void;
  groupEpoch(groupId: Uint8Array): number;
  groupMembers(groupId: Uint8Array): string[];
}
