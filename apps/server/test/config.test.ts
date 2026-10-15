import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../src/config.js";

const SECRET_32_BYTES = "0123456789abcdef0123456789abcdef";

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
    const config = loadServerConfig({ JWT_SECRET: SECRET_32_BYTES });

    expect(config.jwtSecret).toBe(SECRET_32_BYTES);
  });

  it("measures the JWT secret in bytes, not characters", () => {
    expect(() =>
      loadServerConfig({ JWT_SECRET: "é".repeat(16) }),
    ).not.toThrow();
    expect(() => loadServerConfig({ JWT_SECRET: "é".repeat(15) })).toThrow(
      /30 bytes/,
    );
  });

  it("refuses to start without a JWT secret", () => {
    expect(() => loadServerConfig({})).toThrow(/JWT_SECRET is missing/);
  });

  it("treats an empty JWT secret as missing", () => {
    expect(() => loadServerConfig({ JWT_SECRET: "" })).toThrow(
      /JWT_SECRET is missing/,
    );
  });

  it("refuses a JWT secret of 31 bytes and says how long it was", () => {
    expect(() =>
      loadServerConfig({ JWT_SECRET: SECRET_32_BYTES.slice(1) }),
    ).toThrow(
      /JWT_SECRET is 31 bytes long; it must be at least 32 random bytes/,
    );
  });

  it("never puts the secret itself in the message", () => {
    const shortSecret = "short-but-secret";

    const message = messageThrownBy(() =>
      loadServerConfig({ JWT_SECRET: shortSecret }),
    );

    expect(message).toMatch(/JWT_SECRET is 16 bytes long/);
    expect(message).not.toContain(shortSecret);
  });

  it("stores the database in newcord.db unless DATABASE_PATH says otherwise", () => {
    expect(loadServerConfig({ JWT_SECRET: SECRET_32_BYTES }).databasePath).toBe(
      "newcord.db",
    );
    expect(
      loadServerConfig({
        JWT_SECRET: SECRET_32_BYTES,
        DATABASE_PATH: "/x/app.db",
      }).databasePath,
    ).toBe("/x/app.db");
  });
});
