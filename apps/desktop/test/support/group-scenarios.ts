import { expect, vi } from "vitest";
import type { AccountHub } from "../../src/main/hub/account-hub";
import { groupIdFromText } from "../../src/main/groups/group-context";
import type { InProcessServer } from "./in-process-server";
import {
  credentialsOf,
  type LiveInstallation,
  type LiveInstallations,
} from "./live-installations";

const WAIT = { timeout: 3000, interval: 10 };

/** The installation's Account hub, once its connection was accepted. */
export async function hubOf(
  installation: LiveInstallation,
): Promise<AccountHub> {
  return vi.waitFor(() => {
    const hub = installation.deviceHub.current();
    if (hub === undefined) throw new Error("no Account hub yet");
    return hub;
  }, WAIT);
}

/** Waits until the server holds the installation's 20 Key packages, so others can add it. */
export async function readyToBeAdded(
  server: InProcessServer,
  installation: LiveInstallation,
): Promise<void> {
  const deviceId = installation.store.readAccount()?.deviceId;
  await vi.waitFor(() => {
    const count = server.database
      .prepare(
        "SELECT count(*) FROM key_packages WHERE device_id = ? AND last_resort = 0",
      )
      .pluck()
      .get(deviceId) as number;
    expect(count).toBe(20);
  }, WAIT);
}

/** Signs an Account up and waits until it can be added to Groups. */
export async function memberReady(
  server: InProcessServer,
  installations: LiveInstallations,
  username: string,
): Promise<LiveInstallation> {
  const installation = await installations.signedUp(username);
  await readyToBeAdded(server, installation);
  return installation;
}

/** Logs an existing Account in on a new installation, a second Device (D59). */
export async function secondDevice(
  server: InProcessServer,
  installations: LiveInstallations,
  username: string,
): Promise<LiveInstallation> {
  const installation = installations.install();
  await installation.actions.logIn(credentialsOf(username), {
    switchAccount: false,
  });
  await readyToBeAdded(server, installation);
  return installation;
}

/** Creates a Group on the installation and returns its ID. */
export async function createdGroup(
  installation: LiveInstallation,
  name = "friends",
): Promise<string> {
  const result = await (await hubOf(installation)).groups.createGroup(name);
  if (result.outcome !== "created")
    throw new Error(`refused: ${result.refusal}`);
  return result.group.groupId;
}

/** The names of the Groups the installation lists. */
export async function groupNames(
  installation: LiveInstallation,
): Promise<string[]> {
  const groups = await (await hubOf(installation)).groups.listGroups();
  return groups.map((group) => group.name);
}

/** Waits until the installation lists the Group. */
export async function waitUntilInGroup(
  installation: LiveInstallation,
  groupId: string,
): Promise<void> {
  const hub = await hubOf(installation);
  await vi.waitFor(async () => {
    const groups = await hub.groups.listGroups();
    expect(groups.map((group) => group.groupId)).toContain(groupId);
  }, WAIT);
}

/** Invites `username`, waits for the Invitation to reach `invitee`, accepts it, and waits until `invitee` is in. */
export async function inviteAndJoin(
  inviter: LiveInstallation,
  invitee: LiveInstallation,
  groupId: string,
  username: string,
): Promise<void> {
  const invited = await (
    await hubOf(inviter)
  ).groups.inviteToGroup(groupId, username);
  expect(invited).toEqual({ outcome: "done" });
  const inviteeHub = await hubOf(invitee);
  const invitation = await vi.waitFor(async () => {
    const pending = await inviteeHub.groups.listInvitations();
    const found = pending.find((entry) => entry.groupId === groupId);
    if (found === undefined) throw new Error("no Invitation yet");
    return found;
  }, WAIT);
  await inviteeHub.groups.answerInvitation(invitation.invitationId, true);
  await waitUntilInGroup(invitee, groupId);
}

/** The MLS epoch and members the installation's engine holds for the Group. */
export async function mlsView(
  installation: LiveInstallation,
  groupId: string,
): Promise<{ epoch: number; members: string[] }> {
  const hub = await hubOf(installation);
  const id = groupIdFromText(groupId);
  return hub.mls.read((engine) => ({
    epoch: engine.groupEpoch(id),
    members: engine.groupMembers(id).sort(),
  }));
}

/** The Group's epoch and Member Devices on the server. */
export function serverGroup(
  server: InProcessServer,
  groupId: string,
): { epoch: number; members: string[] } {
  const id = Buffer.from(groupId, "base64url");
  const epoch = server.database
    .prepare("SELECT epoch FROM groups WHERE id = ?")
    .pluck()
    .get(id) as number;
  const members = server.database
    .prepare(
      "SELECT device_id FROM group_members WHERE group_id = ? ORDER BY device_id",
    )
    .pluck()
    .all(id) as string[];
  return { epoch, members };
}

/** The credential identity of the installation's Device. */
export function identityOf(installation: LiveInstallation): string {
  const account = installation.store.readAccount();
  if (account === undefined) throw new Error("no Account stored");
  return `${account.username}:${account.deviceId}`;
}

/** The Device ID of the installation. */
export function deviceIdOf(installation: LiveInstallation): string {
  const deviceId = installation.store.readAccount()?.deviceId;
  if (deviceId === undefined) throw new Error("no Account stored");
  return deviceId;
}

export { WAIT };
