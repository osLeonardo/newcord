import { describe, expect, it } from "vitest";
import {
  recoveryCodeGroups,
  viewForSessionState,
} from "../src/renderer/src/app-view";

describe("viewForSessionState", () => {
  it("shows the home screen while logged in", () => {
    expect(
      viewForSessionState({ status: "logged-in", username: "alice" }),
    ).toEqual({ screen: "home", username: "alice" });
  });

  it("shows the login screen, with the username filled in, after a logout", () => {
    expect(
      viewForSessionState({ status: "logged-out", username: "alice" }),
    ).toEqual({ screen: "log-in", storedUsername: "alice" });
  });

  it("shows the sign-up screen on an installation with no Account yet", () => {
    expect(
      viewForSessionState({ status: "logged-out", username: null }),
    ).toEqual({ screen: "sign-up", storedUsername: null });
  });
});

describe("recoveryCodeGroups", () => {
  it("splits a 24-character Recovery code into six groups of four", () => {
    expect(recoveryCodeGroups("0123456789ABCDEFGHJKMNPQ")).toEqual([
      "0123",
      "4567",
      "89AB",
      "CDEF",
      "GHJK",
      "MNPQ",
    ]);
  });

  it("keeps a shorter last group rather than dropping characters", () => {
    expect(recoveryCodeGroups("ABCDEF")).toEqual(["ABCD", "EF"]);
  });

  it("has no groups for an empty code", () => {
    expect(recoveryCodeGroups("")).toEqual([]);
  });
});
