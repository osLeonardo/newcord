import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { runWhileAppIsUp, startRepeatingTask } from "../repeating-task.js";

/** Queued copies and pending Invitations last 30 days (D24). */
export const QUEUE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** The cleanup runs every hour (09-m2-build step 8). */
export const QUEUE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** The Groups where a Device missed a commit or a welcome, which now need a resync prompt. */
export interface QueueCleanupResult {
  resyncGroupIds: Buffer[];
}

interface ExpiredMembershipCopy {
  groupId: Buffer;
  deviceId: string;
}

/**
 * Creates the cleanup: it deletes queued copies older than 30 days, marks a Device that lost a
 * commit or welcome that way as needing a resync, and expires pending Invitations older than 30 days.
 * Example: `const { resyncGroupIds } = createQueueCleanup(database, clock)();`
 */
export function createQueueCleanup(
  database: Database.Database,
  clock: () => number,
): () => QueueCleanupResult {
  const markResync = createResyncMark(database);
  const deleteExpired = createExpiredDeletion(database);
  return database.transaction((): QueueCleanupResult => {
    const cutoff = clock() - QUEUE_RETENTION_MS;
    const resyncGroupIds = markResync(cutoff);
    deleteExpired(cutoff);
    return { resyncGroupIds };
  });
}

/**
 * Runs the cleanup every hour while the app is up and hands its resync Groups to `onResyncNeeded`.
 * Example: `scheduleQueueCleanup(app, cleanUp, (groupId) => prompter.promptGroup(groupId));`
 */
export function scheduleQueueCleanup(
  app: FastifyInstance,
  cleanUp: () => QueueCleanupResult,
  onResyncNeeded: (groupId: Buffer) => void,
): void {
  runWhileAppIsUp(app, () =>
    startRepeatingTask(() => {
      cleanUp().resyncGroupIds.forEach(onResyncNeeded);
    }, QUEUE_CLEANUP_INTERVAL_MS),
  );
}

function createResyncMark(
  database: Database.Database,
): (cutoff: number) => Buffer[] {
  const listExpired = database.prepare<[number], ExpiredMembershipCopy>(
    `SELECT DISTINCT deliveries.group_id AS groupId, deliveries.device_id AS deviceId
       FROM deliveries JOIN messages ON messages.group_id = deliveries.group_id AND messages.seq = deliveries.seq
      WHERE messages.created_at < ? AND messages.kind IN ('commit', 'welcome')`,
  );
  const markResync = database.prepare<[Buffer, string]>(
    "UPDATE group_members SET needs_resync = 1 WHERE group_id = ? AND device_id = ? AND leaving = 0",
  );
  return (cutoff): Buffer[] => {
    const groups = new Map<string, Buffer>();
    for (const copy of listExpired.all(cutoff)) {
      if (markResync.run(copy.groupId, copy.deviceId).changes === 0) continue;
      groups.set(copy.groupId.toString("hex"), copy.groupId);
    }
    return [...groups.values()];
  };
}

function createExpiredDeletion(
  database: Database.Database,
): (cutoff: number) => void {
  const deleteDeliveries = database.prepare<[number]>(
    `DELETE FROM deliveries WHERE EXISTS (
       SELECT 1 FROM messages WHERE messages.group_id = deliveries.group_id
          AND messages.seq = deliveries.seq AND messages.created_at < ?)`,
  );
  const deleteMessages = database.prepare<[number]>(
    "DELETE FROM messages WHERE created_at < ?",
  );
  const expireInvitations = database.prepare<[number]>(
    "UPDATE invitations SET status = 'expired' WHERE status = 'pending' AND created_at < ?",
  );
  return (cutoff): void => {
    deleteDeliveries.run(cutoff);
    deleteMessages.run(cutoff);
    expireInvitations.run(cutoff);
  };
}
