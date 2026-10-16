import type Database from "better-sqlite3";

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
  };
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
