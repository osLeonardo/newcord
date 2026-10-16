import type Database from "better-sqlite3";

/**
 * A change a Member's app should commit: add an Account that accepted an Invitation (D13), add a
 * Member's new Device (D56), or re-add a Device that missed a commit (D24).
 */
export type GroupPrompt =
  | { kind: "invite.accepted"; username: string }
  | { kind: "device.new" | "resync"; username: string; deviceId: string };

/** Reads the open prompts from the Group's state: each lasts until a commit handles it. */
export interface PromptStore {
  promptsOf(groupId: Buffer): GroupPrompt[];
  /** The Groups where the Device is an active Member. */
  activeGroupsOfDevice(deviceId: string): Buffer[];
  /** The Groups where any Device of the Account is an active Member. */
  activeGroupsOfAccount(userId: number): Buffer[];
}

const ACTIVE_ACCOUNTS_OF_GROUP = `
SELECT member_device.user_id FROM group_members AS member
  JOIN devices AS member_device ON member_device.id = member.device_id
 WHERE member.group_id = @groupId AND member.leaving = 0`;

/**
 * Creates the prompt store on an open database.
 * Example: `const prompts = createPromptStore(database).promptsOf(groupId);`
 */
export function createPromptStore(database: Database.Database): PromptStore {
  const acceptedInvitees = database
    .prepare<{ groupId: Buffer }, string>(
      `SELECT users.username FROM invitations JOIN users ON users.id = invitations.to_user
        WHERE invitations.group_id = @groupId AND invitations.status = 'accepted'
          AND invitations.to_user NOT IN (${ACTIVE_ACCOUNTS_OF_GROUP})
        ORDER BY invitations.created_at, users.username`,
    )
    .pluck();
  const devicesToAdd = database.prepare<
    { groupId: Buffer },
    { username: string; deviceId: string }
  >(
    `SELECT users.username, devices.id AS deviceId FROM devices JOIN users ON users.id = devices.user_id
      WHERE devices.user_id IN (${ACTIVE_ACCOUNTS_OF_GROUP})
        AND devices.id NOT IN (SELECT device_id FROM group_members WHERE group_id = @groupId)
      ORDER BY devices.created_at, devices.id`,
  );
  const devicesToResync = database.prepare<
    { groupId: Buffer },
    { username: string; deviceId: string }
  >(
    `SELECT users.username, group_members.device_id AS deviceId FROM group_members
       JOIN devices ON devices.id = group_members.device_id JOIN users ON users.id = devices.user_id
      WHERE group_members.group_id = @groupId AND group_members.needs_resync = 1 AND group_members.leaving = 0
      ORDER BY group_members.device_id`,
  );
  return {
    promptsOf: (groupId): GroupPrompt[] => [
      ...acceptedInvitees.all({ groupId }).map((username): GroupPrompt => ({
        kind: "invite.accepted",
        username,
      })),
      ...devicesToAdd
        .all({ groupId })
        .map((device): GroupPrompt => ({ kind: "device.new", ...device })),
      ...devicesToResync
        .all({ groupId })
        .map((device): GroupPrompt => ({ kind: "resync", ...device })),
    ],
    ...createActiveGroupLookups(database),
  };
}

function createActiveGroupLookups(
  database: Database.Database,
): Pick<PromptStore, "activeGroupsOfDevice" | "activeGroupsOfAccount"> {
  const groupsOfDevice = database
    .prepare<[string], Buffer>(
      "SELECT group_id FROM group_members WHERE device_id = ? AND leaving = 0",
    )
    .pluck();
  const groupsOfAccount = database
    .prepare<[number], Buffer>(
      `SELECT DISTINCT group_members.group_id FROM group_members
         JOIN devices ON devices.id = group_members.device_id
        WHERE devices.user_id = ? AND group_members.leaving = 0`,
    )
    .pluck();
  return {
    activeGroupsOfDevice: (deviceId): Buffer[] => groupsOfDevice.all(deviceId),
    activeGroupsOfAccount: (userId): Buffer[] => groupsOfAccount.all(userId),
  };
}
