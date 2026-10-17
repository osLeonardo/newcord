import { describe, expect, it, vi, type Mock } from "vitest";
import {
  createFetchTransport,
  type FetchFunction,
  type FetchInit,
} from "../src/main/server-api/fetch-transport";

const serverAddress = "http://localhost:3000";

function fakeFetch(status: number, replyText: string): Mock<FetchFunction> {
  return vi.fn<FetchFunction>(() =>
    Promise.resolve({ status, text: () => Promise.resolve(replyText) }),
  );
}

function sentRequest(fetchFunction: Mock<FetchFunction>): {
  url: string;
  init: FetchInit;
} {
  const [call] = fetchFunction.mock.calls;
  if (call === undefined) throw new Error("fetch was never called");
  const [url, init] = call;
  return { url, init };
}

describe("createFetchTransport", () => {
  it("posts a JSON body to the path on the built-in server address", async () => {
    const fetchFunction = fakeFetch(201, "{}");

    await createFetchTransport(serverAddress, fetchFunction).post({
      path: "/register",
      body: { username: "alice" },
    });

    const { url, init } = sentRequest(fetchFunction);
    expect(url).toBe("http://localhost:3000/register");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.body).toBe('{"username":"alice"}');
  });

  it("sends the access token as a Bearer authorization header", async () => {
    const fetchFunction = fakeFetch(204, "");

    await createFetchTransport(serverAddress, fetchFunction).post({
      path: "/logout",
      accessToken: "header.claims.signature",
    });

    expect(sentRequest(fetchFunction).init.headers).toEqual({
      authorization: "Bearer header.claims.signature",
    });
  });

  it("sends neither a body nor a content type when there is no body", async () => {
    const fetchFunction = fakeFetch(204, "");

    await createFetchTransport(serverAddress, fetchFunction).post({
      path: "/logout",
    });

    const { init } = sentRequest(fetchFunction);
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty("content-type");
  });

  it("refuses to follow redirects, which could lead away from the built-in address", async () => {
    const fetchFunction = fakeFetch(200, "{}");

    await createFetchTransport(serverAddress, fetchFunction).post({
      path: "/login",
      body: {},
    });

    expect(sentRequest(fetchFunction).init.redirect).toBe("error");
  });

  it("returns the status and the parsed JSON body", async () => {
    const transport = createFetchTransport(
      serverAddress,
      fakeFetch(409, '{"code":"USERNAME_TAKEN"}'),
    );

    await expect(
      transport.post({ path: "/register", body: {} }),
    ).resolves.toEqual({ status: 409, body: { code: "USERNAME_TAKEN" } });
  });

  it.each([
    ["an empty reply", ""],
    ["a reply that is not JSON", "<html>Bad gateway</html>"],
  ])("returns no body for %s", async (_description, replyText) => {
    const transport = createFetchTransport(
      serverAddress,
      fakeFetch(502, replyText),
    );

    await expect(transport.post({ path: "/logout" })).resolves.toEqual({
      status: 502,
      body: undefined,
    });
  });

  it("rejects when the server cannot be reached", async () => {
    const transport = createFetchTransport(serverAddress, () =>
      Promise.reject(new TypeError("fetch failed")),
    );

    await expect(transport.post({ path: "/login", body: {} })).rejects.toThrow(
      "fetch failed",
    );
  });

  it("gets a path with the access token and no body", async () => {
    const fetchFunction = fakeFetch(200, '{"ok":true}');

    const reply = await createFetchTransport(serverAddress, fetchFunction).get({
      path: "/relay/credentials",
      accessToken: "token",
    });

    const { url, init } = sentRequest(fetchFunction);
    expect(url).toBe("http://localhost:3000/relay/credentials");
    expect(init).toEqual({
      method: "GET",
      headers: { authorization: "Bearer token" },
      redirect: "error",
    });
    expect(reply).toEqual({ status: 200, body: { ok: true } });
  });
});
