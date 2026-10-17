import { describe, expect, it } from "vitest";
import { createGroupActions } from "../src/main/groups/group-actions";
import { fakeGroupActions } from "./support/fake-group-actions";

describe("createGroupActions", () => {
  it("answers with the current Group service", async () => {
    const service = fakeGroupActions();
    const actions = createGroupActions(() => service);

    await actions.createGroup("friends");

    expect(service.createGroup).toHaveBeenCalledExactlyOnceWith("friends");
  });

  it("shows nothing and refuses every action while no Group service is running", async () => {
    const actions = createGroupActions(() => undefined);
    const unavailable = { outcome: "refused", refusal: "UNAVAILABLE" };

    await expect(actions.listGroups()).resolves.toEqual([]);
    await expect(actions.listInvitations()).resolves.toEqual([]);
    await expect(actions.createGroup("friends")).resolves.toEqual(unavailable);
    await expect(actions.inviteToGroup("g", "bruno")).resolves.toEqual(
      unavailable,
    );
    await expect(actions.answerInvitation("i", true)).resolves.toEqual(
      unavailable,
    );
  });
});
