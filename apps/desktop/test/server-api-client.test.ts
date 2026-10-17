import {
  ApiErrorCode,
  LoginResponse,
  PasswordRecoveryResponse,
  RefreshResponse,
  RegisterResponse,
  type RegisterRequest,
} from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createIdentityKeyPair,
  identityKeyBase64,
} from "../src/main/identity/identity-key";
import type { ServerTransport } from "../src/main/server-api/fetch-transport";
import {
  createServerApiClient,
  type ServerApiClient,
  type ServerCallResult,
} from "../src/main/server-api/server-api-client";
import {
  startInProcessServer,
  unreachableTransport,
  type InProcessServer,
} from "./support/in-process-server";

const PASSWORD = "correct horse battery staple";

let server: InProcessServer;
let client: ServerApiClient;

beforeEach(async () => {
  server = await startInProcessServer();
  client = createServerApiClient(server.transport);
});

afterEach(async () => {
  await server.close();
});

function registerRequest(
  overrides: Partial<RegisterRequest> = {},
): RegisterRequest {
  return {
    username: "alice",
    password: PASSWORD,
    identityKey: identityKeyBase64(createIdentityKeyPair()),
    ...overrides,
  };
}

function bodyOf<Body>(result: ServerCallResult<Body>): Body {
  if (!result.ok) throw new Error(`the server call failed: ${result.failure}`);
  return result.body;
}

function replyingTransport(status: number, body: unknown): ServerTransport {
  const reply = (): Promise<{ status: number; body: unknown }> =>
    Promise.resolve({ status, body });
  return { post: reply, get: reply };
}

describe("register", () => {
  it("creates the Account and returns the tokens, deviceId and Recovery code", async () => {
    const result = await client.register(registerRequest());

    expect(Value.Check(RegisterResponse, bodyOf(result))).toBe(true);
  });

  it("reports a taken username", async () => {
    await client.register(registerRequest());

    await expect(client.register(registerRequest())).resolves.toEqual({
      ok: false,
      failure: ApiErrorCode.UsernameTaken,
    });
  });

  it("reports an identity key another Account already holds", async () => {
    const identityKey = identityKeyBase64(createIdentityKeyPair());
    await client.register(registerRequest({ identityKey }));

    await expect(
      client.register(registerRequest({ username: "bruno", identityKey })),
    ).resolves.toEqual({ ok: false, failure: ApiErrorCode.IdentityKeyTaken });
  });

  it("treats a refusal without a known code as an unexpected reply", async () => {
    await expect(
      client.register(registerRequest({ username: "Not Valid" })),
    ).resolves.toEqual({ ok: false, failure: "UNEXPECTED_RESPONSE" });
  });
});

describe("logIn", () => {
  it("returns the tokens and the Device's deviceId", async () => {
    const request = registerRequest();
    const signedUp = bodyOf(await client.register(request));

    const loggedIn = bodyOf(await client.logIn(request));

    expect(Value.Check(LoginResponse, loggedIn)).toBe(true);
    expect(loggedIn.deviceId).toBe(signedUp.deviceId);
  });

  it("reports wrong credentials", async () => {
    const request = registerRequest();
    await client.register(request);

    await expect(
      client.logIn({ ...request, password: "not the right password" }),
    ).resolves.toEqual({ ok: false, failure: ApiErrorCode.InvalidCredentials });
  });

  it("reports the rate limit on the sixth attempt within a minute", async () => {
    const request = { ...registerRequest(), password: "a wrong password" };
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await client.logIn(request);
    }

    await expect(client.logIn(request)).resolves.toEqual({
      ok: false,
      failure: ApiErrorCode.RateLimited,
    });
  });
});

describe("refresh", () => {
  it("swaps the refresh token for new tokens", async () => {
    const { refreshToken } = bodyOf(await client.register(registerRequest()));

    const renewed = bodyOf(await client.refresh({ refreshToken }));

    expect(Value.Check(RefreshResponse, renewed)).toBe(true);
    expect(renewed.refreshToken).not.toBe(refreshToken);
  });

  it("reports a refresh token that was already used", async () => {
    const { refreshToken } = bodyOf(await client.register(registerRequest()));
    await client.refresh({ refreshToken });

    await expect(client.refresh({ refreshToken })).resolves.toEqual({
      ok: false,
      failure: ApiErrorCode.InvalidRefreshToken,
    });
  });
});

describe("logOut", () => {
  it("ends the Device's session on the server", async () => {
    const { accessToken, refreshToken } = bodyOf(
      await client.register(registerRequest()),
    );

    await expect(client.logOut(accessToken)).resolves.toEqual({
      ok: true,
      body: undefined,
    });
    await expect(client.refresh({ refreshToken })).resolves.toEqual({
      ok: false,
      failure: ApiErrorCode.InvalidRefreshToken,
    });
  });

  it("reports an access token the server does not accept", async () => {
    await expect(client.logOut("not.a.token")).resolves.toEqual({
      ok: false,
      failure: ApiErrorCode.InvalidAccessToken,
    });
  });
});

describe("changePassword", () => {
  const newPassword = "a brand new long password";

  it("sets the new password, so the old one stops working", async () => {
    const { accessToken } = bodyOf(await client.register(registerRequest()));

    await expect(
      client.changePassword(accessToken, { newPassword }),
    ).resolves.toEqual({ ok: true, body: undefined });
    await expect(
      client.logIn({ ...registerRequest(), password: PASSWORD }),
    ).resolves.toEqual({ ok: false, failure: ApiErrorCode.InvalidCredentials });
  });

  it("reports an access token the server does not accept", async () => {
    await expect(
      client.changePassword("not.a.token", { newPassword }),
    ).resolves.toEqual({ ok: false, failure: ApiErrorCode.InvalidAccessToken });
  });
});

describe("recoverPassword", () => {
  const newPassword = "a brand new long password";

  it("returns a new Recovery code for the right one", async () => {
    const { recoveryCode } = bodyOf(await client.register(registerRequest()));

    const result = await client.recoverPassword({
      username: "alice",
      recoveryCode,
      newPassword,
    });

    expect(Value.Check(PasswordRecoveryResponse, bodyOf(result))).toBe(true);
    expect(bodyOf(result).recoveryCode).not.toBe(recoveryCode);
  });

  it("reports a wrong Recovery code as wrong credentials", async () => {
    await client.register(registerRequest());

    await expect(
      client.recoverPassword({
        username: "alice",
        recoveryCode: "0".repeat(24),
        newPassword,
      }),
    ).resolves.toEqual({ ok: false, failure: ApiErrorCode.InvalidCredentials });
  });
});

describe("a server that cannot be reached", () => {
  it("is reported instead of thrown", async () => {
    const offlineClient = createServerApiClient(unreachableTransport);

    await expect(offlineClient.logIn(registerRequest())).resolves.toEqual({
      ok: false,
      failure: "SERVER_UNREACHABLE",
    });
  });
});

describe("a reply that does not match the contract", () => {
  it.each([
    ["a success body with missing fields", 201, { accessToken: "token" }],
    ["a success status with no body", 201, undefined],
    ["an unexpected success status", 200, { recoveryCode: "0123" }],
    ["an error with an unknown code", 500, { code: "SOMETHING_ELSE" }],
    ["an error without a body", 502, undefined],
  ])("reports %s as an unexpected reply", async (_case, status, body) => {
    const contractBreakingClient = createServerApiClient(
      replyingTransport(status, body),
    );

    await expect(
      contractBreakingClient.register(registerRequest()),
    ).resolves.toEqual({ ok: false, failure: "UNEXPECTED_RESPONSE" });
  });
});
