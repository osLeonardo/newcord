import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/database/open-database.js";

const serverFolder = path.join(import.meta.dirname, "..");
let folder: string;
let child: ChildProcess | undefined;

afterEach(() => {
  child?.kill("SIGKILL");
  child = undefined;
  rmSync(folder, { recursive: true, force: true });
});

/** Starts the server as production does, on a fresh database, and collects its output. */
function startServer(databasePath: string): {
  output: () => string;
  exited: Promise<number | null>;
} {
  let output = "";
  child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: serverFolder,
    env: {
      ...process.env,
      JWT_SECRET: randomBytes(48).toString("base64"),
      RELAY_SECRET: randomBytes(48).toString("base64"),
      RELAY_URLS: "stun:127.0.0.1:3478,turn:127.0.0.1:3478",
      DATABASE_PATH: databasePath,
      LISTEN_HOST: "127.0.0.1",
    },
  });
  child.stdout?.on("data", (data: Buffer) => (output += data.toString()));
  child.stderr?.on("data", (data: Buffer) => (output += data.toString()));
  const exited = new Promise<number | null>((resolve) =>
    child?.once("exit", (code) => {
      resolve(code);
    }),
  );
  return { output: () => output, exited };
}

describe("the server process", () => {
  // Windows ends a process on SIGTERM without running its handlers; the machine runs Linux.
  it.skipIf(process.platform === "win32")(
    "shuts down cleanly on SIGTERM, as systemd stops it",
    async () => {
      folder = mkdtempSync(path.join(tmpdir(), "newcord-server-"));
      const server = startServer(path.join(folder, "newcord.db"));
      await expect
        .poll(() => server.output(), { timeout: 20_000 })
        .toContain("server ready");

      child?.kill("SIGTERM");

      expect(await server.exited).toBe(0);
      expect(server.output()).toContain("SIGTERM: shutting down");
    },
    30_000,
  );

  it("refuses a database written by a newer server", async () => {
    folder = mkdtempSync(path.join(tmpdir(), "newcord-server-"));
    const databasePath = path.join(folder, "newcord.db");
    const newer = new Database(databasePath);
    newer.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
    newer.close();

    const server = startServer(databasePath);

    expect(await server.exited).toBe(1);
    expect(server.output()).toContain("written by a newer newcord server");
  }, 30_000);
});
