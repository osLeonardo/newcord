import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createLoggerOptions } from "../src/logging.js";

describe("createLoggerOptions", () => {
  it("redacts secret fields at the top level and one level down", async () => {
    const lines: string[] = [];
    const app = Fastify({
      logger: createLoggerOptions({
        level: "info",
        stream: { write: (line: string): number => lines.push(line) },
      }),
    });

    app.log.info(
      {
        password: "secret-password-1",
        token: "secret-token-1",
        payload: "secret-payload-1",
        body: {
          newPassword: "secret-password-2",
          accessToken: "secret-token-2",
          refreshToken: "secret-token-3",
          recoveryCode: "secret-code-1",
        },
        req: { headers: { authorization: "Bearer secret-token-4" } },
      },
      "an event",
    );
    await app.close();

    const output = lines.join("");
    expect(output).toContain("an event");
    expect(output).toContain("[redacted]");
    expect(output).not.toMatch(/secret-/);
  });

  it("keeps the level it is given", () => {
    expect(createLoggerOptions({ level: "warn" })).toMatchObject({
      level: "warn",
    });
  });
});
