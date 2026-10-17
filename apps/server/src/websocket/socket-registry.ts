import type { HubSocket } from "./hub-socket.js";

/** The Account and Device an authenticated socket speaks for. */
export interface SocketOwner {
  userId: number;
  deviceId: string;
  username: string;
}

/** Keeps every authenticated socket with its owner; an Account is online while it has one. */
export interface SocketRegistry {
  add(socket: HubSocket, owner: SocketOwner): void;
  /** Forgets a socket and returns its owner, or undefined if it was not registered. */
  remove(socket: HubSocket): SocketOwner | undefined;
  socketsOfDevice(deviceId: string): HubSocket[];
  socketsOfAccount(userId: number): HubSocket[];
  /** Every socket of one Account, with the owner it was registered with. */
  connectionsOfAccount(userId: number): [HubSocket, SocketOwner][];
  allSockets(): HubSocket[];
  isAccountOnline(userId: number): boolean;
  /** The usernames of the online Accounts among `userIds`, once each, sorted. */
  onlineUsernamesAmong(userIds: readonly number[]): string[];
  /** Each Device with at least one socket, once. */
  connectedDeviceIds(): string[];
}

type SocketRegistryQueries = Omit<SocketRegistry, "add" | "remove">;

/**
 * Creates an empty registry, kept in memory: there is one server process (D52).
 * Example: `const registry = createSocketRegistry(); registry.add(socket, owner);`
 */
export function createSocketRegistry(): SocketRegistry {
  const owners = new Map<HubSocket, SocketOwner>();
  return {
    add: (socket, owner): void => {
      owners.set(socket, owner);
    },
    remove: (socket): SocketOwner | undefined => {
      const owner = owners.get(socket);
      owners.delete(socket);
      return owner;
    },
    ...createRegistryQueries(owners),
  };
}

function createRegistryQueries(
  owners: ReadonlyMap<HubSocket, SocketOwner>,
): SocketRegistryQueries {
  const socketsWhere = (
    matches: (owner: SocketOwner) => boolean,
  ): HubSocket[] =>
    [...owners].filter(([, owner]) => matches(owner)).map(([socket]) => socket);
  const ownerList = (): SocketOwner[] => [...owners.values()];
  return {
    socketsOfDevice: (deviceId): HubSocket[] =>
      socketsWhere((owner) => owner.deviceId === deviceId),
    socketsOfAccount: (userId): HubSocket[] =>
      socketsWhere((owner) => owner.userId === userId),
    connectionsOfAccount: (userId): [HubSocket, SocketOwner][] =>
      [...owners].filter(([, owner]) => owner.userId === userId),
    allSockets: (): HubSocket[] => [...owners.keys()],
    isAccountOnline: (userId): boolean =>
      ownerList().some((owner) => owner.userId === userId),
    onlineUsernamesAmong: (userIds): string[] => {
      const wanted = new Set(userIds);
      const online = ownerList().filter((owner) => wanted.has(owner.userId));
      return uniqueValues(online.map((owner) => owner.username)).sort();
    },
    connectedDeviceIds: (): string[] =>
      uniqueValues(ownerList().map((owner) => owner.deviceId)),
  };
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}
