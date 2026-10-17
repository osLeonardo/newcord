import Database from "better-sqlite3";
import { vi } from "vitest";
import { startAppServices } from "../../src/main/app-services";
import type { DeviceHub } from "../../src/main/hub/device-hub";
import type { LocalStore } from "../../src/main/local-store/local-store";
import { createServerApiClient } from "../../src/main/server-api/server-api-client";
import type { LiveSession } from "../../src/main/session/live-session";
import {
  desktopApiEventChannels,
  type Credentials,
  type DesktopApiCalls,
} from "../../src/preload/desktop-api";
import { createFakeMlsEngine } from "./fake-mls-engine";
import { createInjectedSocketOpener } from "./injected-socket-opener";
import type { InProcessServer } from "./in-process-server";
import { createManualClock, type ManualClock } from "./manual-clock";

/** The password every Account in these tests signs up with. */
export const LIVE_TEST_PASSWORD = "correct horse battery staple";

/** One app installation with its live session, as the main process builds it. */
export interface LiveInstallation {
  readonly store: LocalStore;
  readonly clock: ManualClock;
  readonly liveSession: LiveSession;
  readonly sessionEnded: ReturnType<typeof vi.fn<() => void>>;
  readonly actions: DesktopApiCalls;
  readonly deviceHub: DeviceHub;
  /** Failures the hub reported instead of throwing; tests expect none. */
  readonly hubErrors: unknown[];
  /** Every change sent to the app's windows, by event channel. */
  readonly notifications: { channel: string; payload: unknown }[];
}

/** Builds installations talking to one in-process server, and tears them all down. */
export interface LiveInstallations {
  install(): LiveInstallation;
  signedUp(username: string): Promise<LiveInstallation>;
  /** Quits the installation's app and starts it again on the same local database. */
  restart(installation: LiveInstallation): Promise<LiveInstallation>;
  close(): Promise<void>;
}

/** The credentials an Account named `username` signs up with. */
export function credentialsOf(username: string): Credentials {
  return { username, password: LIVE_TEST_PASSWORD };
}

/** Creates the installation factory for `server`. */
export function createLiveInstallations(
  server: InProcessServer,
): LiveInstallations {
  const liveSessions: LiveSession[] = [];
  const databases = new Map<LiveInstallation, Database.Database>();
  const installOn = (database: Database.Database): LiveInstallation => {
    const installation = installApp(server, database);
    liveSessions.push(installation.resources.liveSession);
    databases.set(installation.view, database);
    return installation.view;
  };
  const install = (): LiveInstallation => installOn(new Database(":memory:"));
  return {
    install,
    signedUp: (username) => signUpOn(install(), username),
    restart: async (installation): Promise<LiveInstallation> => {
      const database = databases.get(installation);
      if (database === undefined) throw new Error("unknown installation");
      await installation.liveSession.stop();
      databases.delete(installation);
      return installOn(database);
    },
    close: async (): Promise<void> => {
      for (const liveSession of liveSessions.splice(0))
        await liveSession.stop();
      for (const database of new Set(databases.values())) database.close();
      databases.clear();
    },
  };
}

function installApp(
  server: InProcessServer,
  database: Database.Database,
): {
  view: LiveInstallation;
  resources: { database: Database.Database; liveSession: LiveSession };
} {
  const clock = createManualClock();
  const sessionEnded = vi.fn<() => void>();
  const hubErrors: unknown[] = [];
  const notifications: { channel: string; payload: unknown }[] = [];
  const services = startAppServices({
    database,
    server: createServerApiClient(server.transport),
    openSocket: createInjectedSocketOpener(server.app),
    clock,
    createEngine: createFakeMlsEngine,
    notify: (channel, payload) => {
      notifications.push({ channel, payload });
      if (channel === desktopApiEventChannels.onSessionChanged) sessionEnded();
    },
    reportError: (error) => hubErrors.push(error),
  });
  if (services.deviceHub === undefined) throw new Error("no Group hub");
  const { store, liveSession } = services;
  return {
    view: {
      store,
      clock,
      liveSession,
      sessionEnded,
      actions: services.calls,
      deviceHub: services.deviceHub,
      hubErrors,
      notifications,
    },
    resources: { database, liveSession },
  };
}

async function signUpOn(
  installation: LiveInstallation,
  username: string,
): Promise<LiveInstallation> {
  const result = await installation.actions.signUp(credentialsOf(username), {
    switchAccount: false,
  });
  if (result.outcome !== "signed-up") {
    throw new Error(`sign-up of ${username} was refused: ${result.refusal}`);
  }
  return installation;
}
