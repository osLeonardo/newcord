import { vi, type Mock } from "vitest";
import type { GroupApiCalls } from "../../src/preload/group-api";

export type FakeGroupActions = {
  [Name in keyof GroupApiCalls]: Mock<GroupApiCalls[Name]>;
};

/** Group calls that answer as if everything worked, recording their arguments. */
export function fakeGroupActions(): FakeGroupActions {
  return {
    listGroups: vi.fn<GroupApiCalls["listGroups"]>(() =>
      Promise.resolve([{ groupId: "MgZoqEdt4EEfhsMd_7xNqw", name: "friends" }]),
    ),
    createGroup: vi.fn<GroupApiCalls["createGroup"]>((name) =>
      Promise.resolve({
        outcome: "created",
        group: { groupId: "MgZoqEdt4EEfhsMd_7xNqw", name },
      }),
    ),
    inviteToGroup: vi.fn<GroupApiCalls["inviteToGroup"]>(() =>
      Promise.resolve({ outcome: "done" }),
    ),
    listInvitations: vi.fn<GroupApiCalls["listInvitations"]>(() =>
      Promise.resolve([]),
    ),
    answerInvitation: vi.fn<GroupApiCalls["answerInvitation"]>(() =>
      Promise.resolve({ outcome: "done" }),
    ),
    listMessages: vi.fn<GroupApiCalls["listMessages"]>(() =>
      Promise.resolve([]),
    ),
    sendMessage: vi.fn<GroupApiCalls["sendMessage"]>(() =>
      Promise.resolve({ outcome: "refused", refusal: "UNAVAILABLE" }),
    ),
    listMembers: vi.fn<GroupApiCalls["listMembers"]>(() => Promise.resolve([])),
    removeMember: vi.fn<GroupApiCalls["removeMember"]>(() =>
      Promise.resolve({ outcome: "done" }),
    ),
    leaveGroup: vi.fn<GroupApiCalls["leaveGroup"]>(() =>
      Promise.resolve({ outcome: "done" }),
    ),
    listBlocked: vi.fn<GroupApiCalls["listBlocked"]>(() => Promise.resolve([])),
    blockAccount: vi.fn<GroupApiCalls["blockAccount"]>(() =>
      Promise.resolve({ outcome: "done" }),
    ),
    unblockAccount: vi.fn<GroupApiCalls["unblockAccount"]>(() =>
      Promise.resolve({ outcome: "done" }),
    ),
  };
}
