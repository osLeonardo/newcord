import type { GroupApiCalls } from "../../preload/group-api";

/**
 * The desktop API's Group calls, answered by the logged-in Device's Group service. Until a
 * connection was accepted, or while the MLS module is missing (#4), there are no Groups to show
 * and every action is refused as unavailable.
 * @example const groupActions = createGroupActions(() => deviceHub?.current()?.groups);
 */
export function createGroupActions(
  currentService: () => GroupApiCalls | undefined,
): GroupApiCalls {
  const unavailable = { outcome: "refused", refusal: "UNAVAILABLE" } as const;
  return {
    listGroups: () => currentService()?.listGroups() ?? Promise.resolve([]),
    createGroup: (name) =>
      currentService()?.createGroup(name) ?? Promise.resolve(unavailable),
    inviteToGroup: (groupId, username) =>
      currentService()?.inviteToGroup(groupId, username) ??
      Promise.resolve(unavailable),
    listInvitations: () =>
      currentService()?.listInvitations() ?? Promise.resolve([]),
    answerInvitation: (invitationId, accept) =>
      currentService()?.answerInvitation(invitationId, accept) ??
      Promise.resolve(unavailable),
    listMessages: (groupId) =>
      currentService()?.listMessages(groupId) ?? Promise.resolve([]),
    sendMessage: (groupId, text) =>
      currentService()?.sendMessage(groupId, text) ??
      Promise.resolve(unavailable),
    listMembers: (groupId) =>
      currentService()?.listMembers(groupId) ?? Promise.resolve([]),
    removeMember: (groupId, username) =>
      currentService()?.removeMember(groupId, username) ??
      Promise.resolve(unavailable),
    leaveGroup: (groupId) =>
      currentService()?.leaveGroup(groupId) ?? Promise.resolve(unavailable),
    listBlocked: () => currentService()?.listBlocked() ?? Promise.resolve([]),
    blockAccount: (username) =>
      currentService()?.blockAccount(username) ?? Promise.resolve(unavailable),
    unblockAccount: (username) =>
      currentService()?.unblockAccount(username) ??
      Promise.resolve(unavailable),
  };
}
