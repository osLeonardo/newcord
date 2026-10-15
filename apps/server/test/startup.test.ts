import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));
const GIVE_UP_AFTER_MS = 15_000;

interface EntryRun {
  exitCode: number | null;
  stderr: string;
}

function runServerEntry(env: NodeJS.ProcessEnv): Promise<EntryRun> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: SERVER_ROOT,
      env,
    });
    const killTimer = setTimeout(() => child.kill(), GIVE_UP_AFTER_MS);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (exitCode) => {
      clearTimeout(killTimer);
      resolve({ exitCode, stderr });
    });
  });
}

describe("starting the server", () => {
  it(
    "refuses to start without JWT_SECRET and says why",
    async () => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_PATH: ":memory:",
      };
      delete env.JWT_SECRET;

      const run = await runServerEntry(env);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toMatch(/JWT_SECRET is missing/);
    },
    GIVE_UP_AFTER_MS + 5_000,
  );
});
