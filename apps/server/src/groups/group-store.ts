import type Database from "better-sqlite3";

/** A Member Device row, with the Account it belongs to. */
export interface GroupMember {
  deviceId: string;
  userId: number;
  leaving: boolean;
}

export interface NewGroup {
  groupId: Buffer;
  name: string;
  creatorDeviceId: string;
  createdAt: number;
}

/** Groups and their Member Devices; a Device that asked to leave is no longer an active Member (D57). */
export interface GroupStore {
  /** Stores the Group at epoch 0 with its creator's Device as its only Member; false if the ID is taken. */
  create(group: NewGroup): boolean;
  isActiveMember(groupId: Buffer, deviceId: string): boolean;
  /** Whether any Device of the Account is an active Member of the Group. */
  isAccountActiveMember(groupId: Buffer, userId: number): boolean;
  nameOf(groupId: Buffer): string | undefined;
  rename(groupId: Buffer, name: string): void;
  /** The Group's active Member Devices. */
  activeMemberDeviceIds(groupId: Buffer): string[];
  /** Every other Account with an active Member Device in a Group where this Account has one. */
  coMemberUserIdsOf(userId: number): number[];
  /** The Account's Devices a commit may add: those outside the Group, and those needing a resync (D24, D56). */
  devicesToAdd(groupId: Buffer, userId: number): string[];
  epochOf(groupId: Buffer): number | undefined;
  /** Every Member Device, leaving or not. */
  membersOf(groupId: Buffer): GroupMember[];
  /** Applies an accepted commit's change: removes and adds Devices and raises the epoch by one. */
  applyChange(
    groupId: Buffer,
    removed: readonly string[],
    added: readonly string[],
  ): void;
}

/**
 * Creates the Group store on an open database.
 * Example: `const created = createGroupStore(database).create({ groupId, name, creatorDeviceId, createdAt });`
 */
export function createGroupStore(database: Database.Database): GroupStore {
  return {
    create: createGroupTransaction(database),
    isActiveMember: createActiveMemberCheck(database),
    isAccountActiveMember: createAccountMemberCheck(database),
    nameOf: createNameLookup(database),
    rename: createRename(database),
    activeMemberDeviceIds: createActiveMemberList(database),
    coMemberUserIdsOf: createCoMemberLookup(database),
    devicesToAdd: createDevicesToAddList(database),
    epochOf: createEpochLookup(database),
    membersOf: createMemberList(database),
    applyChange: createChangeTransaction(database),
  };
}

function createEpochLookup(database: Database.Database): GroupStore["epochOf"] {
  const findEpoch = database
    .prepare<[Buffer], number>("SELECT epoch FROM groups WHERE id = ?")
    .pluck();
  return (groupId): number | undefined => findEpoch.get(groupId);
}

function createMemberList(
  database: Database.Database,
): GroupStore["membersOf"] {
  const listMembers = database.prepare<
    [Buffer],
    { deviceId: string; userId: number; leaving: number }
  >(
    `SELECT group_members.device_id AS deviceId, devices.user_id AS userId, group_members.leaving
       FROM group_members JOIN devices ON devices.id = group_members.device_id
      WHERE group_members.group_id = ? ORDER BY group_members.device_id`,
  );
  return (groupId): GroupMember[] =>
    listMembers
      .all(groupId)
      .map((row) => ({ ...row, leaving: row.leaving === 1 }));
}

function createChangeTransaction(
  database: Database.Database,
): GroupStore["applyChange"] {
  const removeMember = database.prepare<[Buffer, string]>(
    "DELETE FROM group_members WHERE group_id = ? AND device_id = ?",
  );
  const addMember = database.prepare<[Buffer, string]>(
    "INSERT INTO group_members (group_id, device_id) VALUES (?, ?)",
  );
  const raiseEpoch = database.prepare<[Buffer]>(
    "UPDATE groups SET epoch = epoch + 1 WHERE id = ?",
  );
  return database.transaction(
    (groupId: Buffer, removed: readonly string[], added: readonly string[]) => {
      for (const deviceId of removed) removeMember.run(groupId, deviceId);
      for (const deviceId of added) addMember.run(groupId, deviceId);
      raiseEpoch.run(groupId);
    },
  );
}

function createDevicesToAddList(
  database: Database.Database,
): GroupStore["devicesToAdd"] {
  const listDevices = database
    .prepare<[Buffer, number], string>(
      `SELECT devices.id FROM devices
         LEFT JOIN group_members ON group_members.device_id = devices.id AND group_members.group_id = ?
        WHERE devices.user_id = ? AND (group_members.device_id IS NULL OR group_members.needs_resync = 1)
        ORDER BY devices.created_at, devices.id`,
    )
    .pluck();
  return (groupId, userId): string[] => listDevices.all(groupId, userId);
}

function createGroupTransaction(
  database: Database.Database,
): GroupStore["create"] {
  const insertGroup = database.prepare<[Buffer, string, number]>(
    "INSERT OR IGNORE INTO groups (id, name, epoch, created_at) VALUES (?, ?, 0, ?)",
  );
  const insertMember = database.prepare<[Buffer, string]>(
    "INSERT INTO group_members (group_id, device_id) VALUES (?, ?)",
  );
  return database.transaction((group: NewGroup): boolean => {
    const { changes } = insertGroup.run(
      group.groupId,
      group.name,
      group.createdAt,
    );
    if (changes === 0) return false;
    insertMember.run(group.groupId, group.creatorDeviceId);
    return true;
  });
}

function createActiveMemberCheck(
  database: Database.Database,
): GroupStore["isActiveMember"] {
  const findMember = database
    .prepare<[Buffer, string], number>(
      "SELECT 1 FROM group_members WHERE group_id = ? AND device_id = ? AND leaving = 0",
    )
    .pluck();
  return (groupId, deviceId): boolean =>
    findMember.get(groupId, deviceId) !== undefined;
}

function createAccountMemberCheck(
  database: Database.Database,
): GroupStore["isAccountActiveMember"] {
  const findMember = database
    .prepare<[Buffer, number], number>(
      `SELECT 1 FROM group_members JOIN devices ON devices.id = group_members.device_id
        WHERE group_members.group_id = ? AND devices.user_id = ? AND group_members.leaving = 0`,
    )
    .pluck();
  return (groupId, userId): boolean =>
    findMember.get(groupId, userId) !== undefined;
}

function createNameLookup(database: Database.Database): GroupStore["nameOf"] {
  const findName = database
    .prepare<[Buffer], string>("SELECT name FROM groups WHERE id = ?")
    .pluck();
  return (groupId): string | undefined => findName.get(groupId);
}

function createRename(database: Database.Database): GroupStore["rename"] {
  const updateName = database.prepare<[string, Buffer]>(
    "UPDATE groups SET name = ? WHERE id = ?",
  );
  return (groupId, name): void => {
    updateName.run(name, groupId);
  };
}

function createActiveMemberList(
  database: Database.Database,
): GroupStore["activeMemberDeviceIds"] {
  const listMembers = database
    .prepare<[Buffer], string>(
      "SELECT device_id FROM group_members WHERE group_id = ? AND leaving = 0 ORDER BY device_id",
    )
    .pluck();
  return (groupId): string[] => listMembers.all(groupId);
}

function createCoMemberLookup(
  database: Database.Database,
): GroupStore["coMemberUserIdsOf"] {
  const listCoMembers = database
    .prepare<[number, number], number>(
      `SELECT DISTINCT other_device.user_id
         FROM devices AS own_device
         JOIN group_members AS own ON own.device_id = own_device.id AND own.leaving = 0
         JOIN group_members AS other ON other.group_id = own.group_id AND other.leaving = 0
         JOIN devices AS other_device ON other_device.id = other.device_id
        WHERE own_device.user_id = ? AND other_device.user_id <> ?
        ORDER BY other_device.user_id`,
    )
    .pluck();
  return (userId): number[] => listCoMembers.all(userId, userId);
}
