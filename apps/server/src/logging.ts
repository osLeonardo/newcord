import type { FastifyServerOptions } from "fastify";

const SECRET_FIELDS = [
  "password",
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
  "recoveryCode",
  "authorization",
  "payload",
];

/** Log paths whose values are replaced, so passwords, tokens, Recovery codes and Payloads never reach a log. */
export const REDACTED_LOG_PATHS = [
  ...SECRET_FIELDS,
  ...SECRET_FIELDS.map((field) => `*.${field}`),
  "req.headers.authorization",
];

export interface ServerLogOptions {
  level: string;
  stream?: { write(line: string): void };
}

/**
 * Builds Fastify's logger settings with secret fields redacted.
 * Example: `Fastify({ logger: createLoggerOptions({ level: "info" }) })`
 */
export function createLoggerOptions(
  log: ServerLogOptions,
): FastifyServerOptions["logger"] {
  return {
    level: log.level,
    ...(log.stream ? { stream: log.stream } : {}),
    redact: { paths: REDACTED_LOG_PATHS, censor: "[redacted]" },
  };
}
