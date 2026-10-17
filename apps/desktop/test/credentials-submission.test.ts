import { describe, expect, it, vi } from "vitest";
import type { Credentials } from "../src/preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../src/renderer/src/account/account-messages";
import {
  submitCredentials,
  type CredentialsSender,
} from "../src/renderer/src/account/credentials-submission";

const valid: Credentials = {
  username: "alice_01",
  password: "correct horse battery staple",
};

describe("submitCredentials", () => {
  it("sends valid credentials and returns the message the sender gives back", async () => {
    const send = vi.fn<CredentialsSender>(() =>
      Promise.resolve("Wrong username or password."),
    );

    await expect(submitCredentials(valid, send)).resolves.toBe(
      "Wrong username or password.",
    );
    expect(send).toHaveBeenCalledExactlyOnceWith(valid);
  });

  it("returns no message when the sender succeeds", async () => {
    await expect(
      submitCredentials(valid, () => Promise.resolve(undefined)),
    ).resolves.toBeUndefined();
  });

  it("explains a problem without sending anything", async () => {
    const send = vi.fn(() => Promise.resolve(undefined));

    await expect(
      submitCredentials({ ...valid, password: "short" }, send),
    ).resolves.toBe("Passwords need at least 12 characters.");
    expect(send).not.toHaveBeenCalled();
  });

  it("turns a failed call into a general message", async () => {
    await expect(
      submitCredentials(valid, () => Promise.reject(new Error("IPC refused"))),
    ).resolves.toBe(UNEXPECTED_FAILURE_MESSAGE);
  });
});
