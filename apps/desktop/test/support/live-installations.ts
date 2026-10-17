import Database from "better-sqlite3";
import type { MlsEngine } from "../../src/main/mls/mls-engine";
import type { NoticeContent } from "../../src/main/app-shell/message-notices";
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
import { loadMlsEngineFactory } from "../../src/main/mls/mls-module";
import { createFakeMlsEngine } from "./fake-mls-engine";
import { createInjectedSocketOpener } from "./injected-socket-opener";
import type { InProcessServer } from "./in-process-server";
import { createManualClock, type ManualClock } from "./manual-clock";

/** The password every Account in these tests signs up with. */
export const LIVE_TEST_PASSWORD = "correct horse battery staple";

/** One app installation with its live session, as the main process builds it. */
export interface LiveInstallation {
  /** The installation's local database, for checks the interface cannot make. */
  readonly database: Database.Database;
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
  /** The Windows notifications on screen, one per Group (#10's spec). */
  readonly shownNotices: Map<string, NoticeContent>;
  /** Tells the services the window gained or lost the focus. */
  windowFocusChanged(focused: boolean): void;
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

/** Set by the "desktop-real-mls" test project: every installation runs the real MLS module (#4). */
export const REAL_MLS = process.env["NEWCORD_TEST_MLS"] === "real";

export interface LiveInstallationOptions {
  /** The MLS engine each installation uses: the test-only fake by default, or the real module. */
  readonly createEngine?: () => MlsEngine;
}

/** Creates the installation factory for `server`. */
export function createLiveInstallations(
  server: InProcessServer,
  options: LiveInstallationOptions = {},
): LiveInstallations {
  const createEngine =
    options.createEngine ??
    (REAL_MLS ? loadMlsEngineFactory() : createFakeMlsEngine);
  const liveSessions: LiveSession[] = [];
  const databases = new Map<LiveInstallation, Database.Database>();
  const installOn = (database: Database.Database): LiveInstallation => {
    const installation = installApp(server, database, createEngine);
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
  createEngine: () => MlsEngine,
): {
  view: LiveInstallation;
  resources: { database: Database.Database; liveSession: LiveSession };
} {
  const clock = createManualClock();
  const sessionEnded = vi.fn<() => void>();
  const hubErrors: unknown[] = [];
  const notifications: { channel: string; payload: unknown }[] = [];
  const shownNotices = new Map<string, NoticeContent>();
  const services = startAppServices({
    database,
    server: createServerApiClient(server.transport),
    openSocket: createInjectedSocketOpener(server.app),
    clock,
    createEngine,
    notify: (channel, payload) => {
      notifications.push({ channel, payload });
      if (channel === desktopApiEventChannels.onSessionChanged) sessionEnded();
    },
    reportError: (error) => hubErrors.push(error),
    notifications: {
      show: (groupId, content) => {
        shownNotices.set(groupId, content);
      },
      close: (groupId) => {
        shownNotices.delete(groupId);
      },
    },
  });
  if (services.deviceHub === undefined) throw new Error("no Group hub");
  const { store, liveSession } = services;
  return {
    view: {
      database,
      store,
      clock,
      liveSession,
      sessionEnded,
      actions: services.calls,
      deviceHub: services.deviceHub,
      hubErrors,
      notifications,
      shownNotices,
      windowFocusChanged: (focused): void => {
        services.windowFocusChanged(focused);
      },
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
