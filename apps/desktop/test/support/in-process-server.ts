import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { buildServerApp } from "server/src/app";
import { openDatabase } from "server/src/database/open-database";
import {
  createFetchTransport,
  type FetchFunction,
  type ServerTransport,
} from "../../src/main/server-api/fetch-transport";

const TEST_JWT_SECRET = "a desktop-test-only JWT secret, longer than 32 bytes";
const DEVELOPMENT_SERVER_ADDRESS = "http://localhost:3000";

/** The real server app from apps/server, on an in-memory database, reached without a network port. */
export interface InProcessServer {
  readonly app: FastifyInstance;
  readonly database: Database.Database;
  /** The app's own fetch transport, with every request handed to the server in memory. */
  readonly transport: ServerTransport;
  close(): Promise<void>;
}

/** Starts the server app on a fresh in-memory database. */
export async function startInProcessServer(): Promise<InProcessServer> {
  const database = openDatabase(":memory:");
  const app = await buildServerApp({ jwtSecret: TEST_JWT_SECRET, database });
  return {
    app,
    database,
    transport: createFetchTransport(
      DEVELOPMENT_SERVER_ADDRESS,
      injectFetch(app),
    ),
    close: async (): Promise<void> => {
      await app.close();
      database.close();
    },
  };
}

/** A transport for a server that cannot be reached, as when it is down or the network is out. */
export const unreachableTransport: ServerTransport = {
  post: () => Promise.reject(new TypeError("fetch failed")),
};

/** Counts the server's rows of an Account's Devices and of a Device's refresh tokens. */
export function serverRowCounts(
  database: Database.Database,
  deviceId: string,
): { users: number; devices: number; deviceRefreshTokens: number } {
  const count = (sql: string, ...parameters: string[]): number =>
    database.prepare<string[], { total: number }>(sql).get(...parameters)
      ?.total ?? 0;
  return {
    users: count("SELECT count(*) AS total FROM users"),
    devices: count("SELECT count(*) AS total FROM devices"),
    deviceRefreshTokens: count(
      "SELECT count(*) AS total FROM refresh_tokens WHERE device_id = ?",
      deviceId,
    ),
  };
}

function injectFetch(app: FastifyInstance): FetchFunction {
  return async (url, init) => {
    const { pathname, search } = new URL(url);
    const response = await app.inject({
      method: init.method,
      url: `${pathname}${search}`,
      headers: { ...init.headers },
      ...(init.body === undefined ? {} : { payload: init.body }),
    });
    return {
      status: response.statusCode,
      text: () => Promise.resolve(response.body),
    };
  };
}
