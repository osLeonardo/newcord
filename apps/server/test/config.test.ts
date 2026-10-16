import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../src/config.js";

const SECRET_32_BYTES = "0123456789abcdef0123456789abcdef";
const RELAY_SECRET = "fedcba9876543210fedcba9876543210";
const RELAY_URLS = "stun:192.168.1.10:3478,turn:192.168.1.10:3478";

/** A complete environment, with the JWT secret changed by `jwtSecret` when given. */
function env(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    JWT_SECRET: SECRET_32_BYTES,
    RELAY_SECRET,
    RELAY_URLS,
    ...overrides,
  };
}

function messageThrownBy(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the action to throw, but it returned");
}

describe("loadServerConfig", () => {
  it("reads a JWT secret of 32 bytes", () => {
    const config = loadServerConfig(env({ JWT_SECRET: SECRET_32_BYTES }));

    expect(config.jwtSecret).toBe(SECRET_32_BYTES);
  });

  it("measures the JWT secret in bytes, not characters", () => {
    expect(() =>
      loadServerConfig(env({ JWT_SECRET: "é".repeat(16) })),
    ).not.toThrow();
    expect(() => loadServerConfig(env({ JWT_SECRET: "é".repeat(15) }))).toThrow(
      /30 bytes/,
    );
  });

  it("refuses to start without a JWT secret", () => {
    expect(() => loadServerConfig(env({ JWT_SECRET: undefined }))).toThrow(
      /JWT_SECRET is missing/,
    );
  });

  it("treats an empty JWT secret as missing", () => {
    expect(() => loadServerConfig(env({ JWT_SECRET: "" }))).toThrow(
      /JWT_SECRET is missing/,
    );
  });

  it("refuses a JWT secret of 31 bytes and says how long it was", () => {
    expect(() =>
      loadServerConfig(env({ JWT_SECRET: SECRET_32_BYTES.slice(1) })),
    ).toThrow(
      /JWT_SECRET is 31 bytes long; it must be at least 32 random bytes/,
    );
  });

  it("never puts the secret itself in the message", () => {
    const shortSecret = "short-but-secret";

    const message = messageThrownBy(() =>
      loadServerConfig(env({ JWT_SECRET: shortSecret })),
    );

    expect(message).toMatch(/JWT_SECRET is 16 bytes long/);
    expect(message).not.toContain(shortSecret);
  });

  it("stores the database in newcord.db unless DATABASE_PATH says otherwise", () => {
    expect(
      loadServerConfig(env({ JWT_SECRET: SECRET_32_BYTES })).databasePath,
    ).toBe("newcord.db");
    expect(
      loadServerConfig(
        env({
          JWT_SECRET: SECRET_32_BYTES,
          DATABASE_PATH: "/x/app.db",
        }),
      ).databasePath,
    ).toBe("/x/app.db");
  });

  it("reads the relay secret and addresses", () => {
    expect(loadServerConfig(env()).relay).toEqual({
      secret: RELAY_SECRET,
      urls: ["stun:192.168.1.10:3478", "turn:192.168.1.10:3478"],
    });
  });

  it.each([
    ["missing", undefined, /RELAY_SECRET is missing/],
    ["31 bytes", RELAY_SECRET.slice(1), /RELAY_SECRET is 31 bytes long/],
  ])("refuses to start with a relay secret %s", (_case, secret, message) => {
    expect(() => loadServerConfig(env({ RELAY_SECRET: secret }))).toThrow(
      message,
    );
  });

  it("refuses to start without relay addresses", () => {
    expect(() => loadServerConfig(env({ RELAY_URLS: "" }))).toThrow(
      /RELAY_URLS is missing/,
    );
  });

  it("names a relay address that is not stun:, turn: or turns:", () => {
    expect(() =>
      loadServerConfig(env({ RELAY_URLS: "stun:a:3478,http://b" })),
    ).toThrow(/RELAY_URLS has "http:\/\/b"/);
  });

  it("never puts the relay secret in the message", () => {
    const shortSecret = "short-relay-secret";

    expect(
      messageThrownBy(() =>
        loadServerConfig(env({ RELAY_SECRET: shortSecret })),
      ),
    ).not.toContain(shortSecret);
  });
});
