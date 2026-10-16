import { ApiErrorCode } from "@newcord/shared";
import { describe, expect, it, vi, type Mock } from "vitest";
import { endServerSession } from "../src/main/account/server-session-end";
import type { SessionTokens } from "../src/main/local-store/local-store";
import type {
  ServerApiClient,
  ServerCallFailure,
  ServerCallResult,
} from "../src/main/server-api/server-api-client";

type RefreshResult = Awaited<ReturnType<ServerApiClient["refresh"]>>;

const storedTokens: SessionTokens = {
  accessToken: "stored.access.token",
  refreshToken: "s".repeat(43),
};
const renewed: RefreshResult = {
  ok: true,
  body: { accessToken: "renewed.access.token", refreshToken: "n".repeat(43) },
};
const loggedOut: ServerCallResult<undefined> = { ok: true, body: undefined };

function failed(failure: ServerCallFailure): ServerCallResult<never> {
  return { ok: false, failure };
}

function fakeServer(
  logOutResults: ServerCallResult<undefined>[],
  refreshResult: RefreshResult,
): {
  server: Pick<ServerApiClient, "logOut" | "refresh">;
  logOut: Mock<ServerApiClient["logOut"]>;
  refresh: Mock<ServerApiClient["refresh"]>;
} {
  const logOut = vi.fn<ServerApiClient["logOut"]>(() =>
    Promise.resolve(logOutResults.shift() ?? failed("UNEXPECTED_RESPONSE")),
  );
  const refresh = vi.fn<ServerApiClient["refresh"]>(() =>
    Promise.resolve(refreshResult),
  );
  return {
    server: { refresh, logOut },
    logOut,
    refresh,
  };
}

describe("endServerSession", () => {
  it("logs out with the stored access token", async () => {
    const { server, logOut, refresh } = fakeServer([loggedOut], renewed);

    await endServerSession(server, storedTokens);

    expect(logOut).toHaveBeenCalledExactlyOnceWith("stored.access.token");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renews a refused access token once and logs out with the new one", async () => {
    const { server, logOut, refresh } = fakeServer(
      [failed(ApiErrorCode.InvalidAccessToken), loggedOut],
      renewed,
    );

    await endServerSession(server, storedTokens);

    expect(refresh).toHaveBeenCalledExactlyOnceWith({
      refreshToken: storedTokens.refreshToken,
    });
    expect(logOut).toHaveBeenLastCalledWith("renewed.access.token");
  });

  it("stops when the refresh token is refused too, as the session already ended", async () => {
    const { server, logOut } = fakeServer(
      [failed(ApiErrorCode.InvalidAccessToken)],
      failed(ApiErrorCode.InvalidRefreshToken),
    );

    await endServerSession(server, storedTokens);

    expect(logOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    "SERVER_UNREACHABLE",
    "UNEXPECTED_RESPONSE",
    ApiErrorCode.RateLimited,
  ] as const)("does not renew after %s", async (failure) => {
    const { server, refresh } = fakeServer([failed(failure)], renewed);

    await endServerSession(server, storedTokens);

    expect(refresh).not.toHaveBeenCalled();
  });
});
