import { describe, expect, it, vi } from "vitest";
import type { DesktopApi } from "../src/preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../src/renderer/src/account/account-messages";
import {
  newPasswordProblem,
  recoveryProblem,
  type RecoveryInput,
} from "../src/renderer/src/account/credentials-check";
import {
  submitPasswordChange,
  submitPasswordRecovery,
} from "../src/renderer/src/account/password-submission";
import type { AppView } from "../src/renderer/src/app-view";

const NEW_PASSWORD = "a brand new long password";
const recovery: RecoveryInput = {
  username: "alice",
  recoveryCode: "0123-4567-89AB-CDEF-GHJK-MNPQ",
  newPassword: NEW_PASSWORD,
  repeatedPassword: NEW_PASSWORD,
};

describe("newPasswordProblem", () => {
  it("finds nothing wrong with a long enough password typed twice alike", () => {
    expect(
      newPasswordProblem({
        newPassword: NEW_PASSWORD,
        repeatedPassword: NEW_PASSWORD,
      }),
    ).toBeUndefined();
  });

  it("refuses two different passwords", () => {
    expect(
      newPasswordProblem({
        newPassword: NEW_PASSWORD,
        repeatedPassword: `${NEW_PASSWORD}!`,
      }),
    ).toBe("PASSWORDS_DIFFER");
  });

  it("refuses a password shorter than 12 characters, even typed twice alike", () => {
    expect(
      newPasswordProblem({
        newPassword: "eleven char",
        repeatedPassword: "eleven char",
      }),
    ).toBe("PASSWORD_TOO_SHORT");
  });
});

describe("recoveryProblem", () => {
  it.each([
    "0123456789ABCDEFGHJKMNPQ",
    "o123 4567 89ab cdef ghjk mnpq",
    "OI23-4567-89AB-CDEF-GHJK-MNPQ",
    "-0123-4567-89AB-CDEF-GHJK-MNPL-",
  ])("accepts the code %j", (recoveryCode) => {
    expect(recoveryProblem({ ...recovery, recoveryCode })).toBeUndefined();
  });

  it.each([
    "0123-4567",
    "0123456789ABCDEFGHJKMNPQR",
    "U123456789ABCDEFGHJKMNPQ",
    "0123_4567_89AB_CDEF_GHJK_MNPQ",
  ])("refuses the code %j", (recoveryCode) => {
    expect(recoveryProblem({ ...recovery, recoveryCode })).toBe(
      "INVALID_RECOVERY_CODE",
    );
  });

  it("refuses an invalid username first", () => {
    expect(
      recoveryProblem({ ...recovery, username: "Alice", recoveryCode: "x" }),
    ).toBe("INVALID_USERNAME");
  });

  it("checks the new password last", () => {
    expect(recoveryProblem({ ...recovery, repeatedPassword: "other" })).toBe(
      "PASSWORDS_DIFFER",
    );
  });
});

describe("submitPasswordChange", () => {
  function desktopApiAnswering(
    answer: ReturnType<DesktopApi["changePassword"]>,
  ): Pick<DesktopApi, "changePassword"> {
    return {
      changePassword: vi.fn<DesktopApi["changePassword"]>(() => answer),
    };
  }

  it("sends only the new password and reports the change", async () => {
    const desktopApi = desktopApiAnswering(
      Promise.resolve({ outcome: "changed" }),
    );

    await expect(
      submitPasswordChange(desktopApi, {
        newPassword: NEW_PASSWORD,
        repeatedPassword: NEW_PASSWORD,
      }),
    ).resolves.toEqual({ changed: true });
    expect(desktopApi.changePassword).toHaveBeenCalledExactlyOnceWith(
      NEW_PASSWORD,
    );
  });

  it("sends nothing when the two passwords differ", async () => {
    const desktopApi = desktopApiAnswering(
      Promise.resolve({ outcome: "changed" }),
    );

    await expect(
      submitPasswordChange(desktopApi, {
        newPassword: NEW_PASSWORD,
        repeatedPassword: "another long password",
      }),
    ).resolves.toEqual({
      changed: false,
      message: "The two passwords do not match.",
    });
    expect(desktopApi.changePassword).not.toHaveBeenCalled();
  });

  it("explains the rate limit", async () => {
    await expect(
      submitPasswordChange(
        desktopApiAnswering(
          Promise.resolve({ outcome: "refused", refusal: "RATE_LIMITED" }),
        ),
        { newPassword: NEW_PASSWORD, repeatedPassword: NEW_PASSWORD },
      ),
    ).resolves.toEqual({
      changed: false,
      message: "Too many attempts. Try again later.",
    });
  });

  it("reports a failed call without its details", async () => {
    await expect(
      submitPasswordChange(
        desktopApiAnswering(Promise.reject(new Error("IPC refused"))),
        { newPassword: NEW_PASSWORD, repeatedPassword: NEW_PASSWORD },
      ),
    ).resolves.toEqual({ changed: false, message: UNEXPECTED_FAILURE_MESSAGE });
  });
});

describe("submitPasswordRecovery", () => {
  function desktopApiAnswering(
    answer: ReturnType<DesktopApi["recoverPassword"]>,
  ): Pick<DesktopApi, "recoverPassword"> {
    return {
      recoverPassword: vi.fn<DesktopApi["recoverPassword"]>(() => answer),
    };
  }

  it("sends the code as typed and shows the new code, then the login screen", async () => {
    const desktopApi = desktopApiAnswering(
      Promise.resolve({
        outcome: "recovered",
        recoveryCode: "QPNMKJHGFEDCBA9876543210",
        session: { status: "logged-out", username: "alice" },
      }),
    );
    const show = vi.fn<(view: AppView) => void>();

    await expect(
      submitPasswordRecovery(desktopApi, recovery, show),
    ).resolves.toBeUndefined();
    expect(desktopApi.recoverPassword).toHaveBeenCalledExactlyOnceWith({
      username: "alice",
      recoveryCode: recovery.recoveryCode,
      newPassword: NEW_PASSWORD,
    });
    expect(show).toHaveBeenCalledExactlyOnceWith({
      screen: "recovery-code",
      recoveryCode: "QPNMKJHGFEDCBA9876543210",
      next: { screen: "log-in", storedUsername: "alice" },
    });
  });

  it("says a wrong code is a wrong code", async () => {
    const show = vi.fn<(view: AppView) => void>();

    await expect(
      submitPasswordRecovery(
        desktopApiAnswering(
          Promise.resolve({
            outcome: "refused",
            refusal: "INVALID_CREDENTIALS",
          }),
        ),
        recovery,
        show,
      ),
    ).resolves.toBe("Wrong username or Recovery code.");
    expect(show).not.toHaveBeenCalled();
  });

  it("sends nothing for a malformed code", async () => {
    const desktopApi: Pick<DesktopApi, "recoverPassword"> = {
      recoverPassword: vi.fn<DesktopApi["recoverPassword"]>(),
    };

    await expect(
      submitPasswordRecovery(
        desktopApi,
        { ...recovery, recoveryCode: "0123" },
        () => undefined,
      ),
    ).resolves.toBe(
      "A Recovery code has 24 letters and digits, as shown when it was made.",
    );
    expect(desktopApi.recoverPassword).not.toHaveBeenCalled();
  });
});
