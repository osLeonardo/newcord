import type Database from "better-sqlite3";

export interface NewInvitation {
  id: string;
  groupId: Buffer;
  fromUser: number;
  toUser: number;
  /** Stored but never delivered: the invitee blocks the inviter (D57). */
  hidden: boolean;
  createdAt: number;
}

/** A pending Invitation as the invitee is shown it. */
export interface DeliverableInvitation {
  invitationId: string;
  groupId: Buffer;
  groupName: string;
  fromUsername: string;
}

export type InvitationAnswer = "accepted" | "declined";

/** Invitations: pending until answered, accepted until the invitee's Devices are added. */
export interface InvitationStore {
  create(invitation: NewInvitation): void;
  /** Whether the Account has a pending or accepted Invitation to the Group. */
  hasOpenInvitation(groupId: Buffer, toUser: number): boolean;
  /** Distinct people in the Group or invited to it: active Member Accounts and open invitees (D17). */
  peopleCount(groupId: Buffer): number;
  /** The Account's pending Invitations it may see, oldest first. */
  deliverableFor(toUser: number): DeliverableInvitation[];
  /** The Group of a pending, visible Invitation addressed to the Account, if there is one. */
  pendingGroupOf(invitationId: string, toUser: number): Buffer | undefined;
  answer(invitationId: string, answer: InvitationAnswer): void;
  /** Whether a pending or accepted Invitation joins the two Accounts, either way (D64). */
  isOpenBetween(firstUser: number, secondUser: number): boolean;
}

/**
 * Creates the Invitation store on an open database.
 * Example: `createInvitationStore(database).create({ id, groupId, fromUser, toUser, hidden: false, createdAt });`
 */
export function createInvitationStore(
  database: Database.Database,
): InvitationStore {
  return {
    create: createInsert(database),
    hasOpenInvitation: createOpenInvitationCheck(database),
    peopleCount: createPeopleCount(database),
    deliverableFor: createDeliverableList(database),
    pendingGroupOf: createPendingGroupLookup(database),
    answer: createAnswer(database),
    isOpenBetween: createOpenBetweenCheck(database),
  };
}

const OPEN = "status IN ('pending', 'accepted')";

function createInsert(database: Database.Database): InvitationStore["create"] {
  const insert = database.prepare<
    [string, Buffer, number, number, number, number]
  >(
    "INSERT INTO invitations (id, group_id, from_user, to_user, status, hidden, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
  );
  return (invitation): void => {
    insert.run(
      invitation.id,
      invitation.groupId,
      invitation.fromUser,
      invitation.toUser,
      invitation.hidden ? 1 : 0,
      invitation.createdAt,
    );
  };
}

function createOpenInvitationCheck(
  database: Database.Database,
): InvitationStore["hasOpenInvitation"] {
  const find = database
    .prepare<[Buffer, number], number>(
      `SELECT 1 FROM invitations WHERE group_id = ? AND to_user = ? AND ${OPEN}`,
    )
    .pluck();
  return (groupId, toUser): boolean => find.get(groupId, toUser) !== undefined;
}

function createPeopleCount(
  database: Database.Database,
): InvitationStore["peopleCount"] {
  const count = database
    .prepare<[Buffer, Buffer], number>(
      `SELECT count(*) FROM (
         SELECT devices.user_id FROM group_members
           JOIN devices ON devices.id = group_members.device_id
          WHERE group_members.group_id = ? AND group_members.leaving = 0
         UNION
         SELECT to_user FROM invitations WHERE group_id = ? AND ${OPEN}
       )`,
    )
    .pluck();
  return (groupId): number => count.get(groupId, groupId) ?? 0;
}

function createDeliverableList(
  database: Database.Database,
): InvitationStore["deliverableFor"] {
  const list = database.prepare<[number], DeliverableInvitation>(
    `SELECT invitations.id AS invitationId, invitations.group_id AS groupId,
            groups.name AS groupName, users.username AS fromUsername
       FROM invitations
       JOIN groups ON groups.id = invitations.group_id
       JOIN users ON users.id = invitations.from_user
      WHERE invitations.to_user = ? AND invitations.status = 'pending' AND invitations.hidden = 0
      ORDER BY invitations.created_at, invitations.id`,
  );
  return (toUser): DeliverableInvitation[] => list.all(toUser);
}

function createPendingGroupLookup(
  database: Database.Database,
): InvitationStore["pendingGroupOf"] {
  const find = database
    .prepare<[string, number], Buffer>(
      "SELECT group_id FROM invitations WHERE id = ? AND to_user = ? AND status = 'pending' AND hidden = 0",
    )
    .pluck();
  return (invitationId, toUser): Buffer | undefined =>
    find.get(invitationId, toUser);
}

function createAnswer(database: Database.Database): InvitationStore["answer"] {
  const update = database.prepare<[InvitationAnswer, string]>(
    "UPDATE invitations SET status = ? WHERE id = ?",
  );
  return (invitationId, answer): void => {
    update.run(answer, invitationId);
  };
}

function createOpenBetweenCheck(
  database: Database.Database,
): InvitationStore["isOpenBetween"] {
  const find = database
    .prepare<[number, number, number, number], number>(
      `SELECT 1 FROM invitations
        WHERE ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)) AND ${OPEN}`,
    )
    .pluck();
  return (first, second): boolean =>
    find.get(first, second, second, first) !== undefined;
}
