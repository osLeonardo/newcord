import type Database from "better-sqlite3";
import {
  desktopApiEventChannels,
  type DesktopApiCalls,
} from "../preload/desktop-api";
import { createAccountActions } from "./account/account-actions";
import { sessionStateOf } from "./account/session-state";
import {
  createCallActions,
  createCallSettingsActions,
} from "./calls/call-actions";
import {
  createVoiceControls,
  type HotkeyRegistry,
  type KeyboardHook,
  type VoiceControls,
} from "./calls/voice-controls";
import {
  createCallSettingsStore,
  type CallSettingsStore,
} from "./local-store/call-settings";
import { createGroupActions } from "./groups/group-actions";
import { createDeviceHub, type DeviceHub } from "./hub/device-hub";
import {
  createIdentityKeyPair,
  loadOrCreateIdentityKey,
} from "./identity/identity-key";
import { createLocalGroups } from "./local-store/local-groups";
import { createLocalMessages } from "./local-store/local-messages";
import { createVerifiedMarks } from "./local-store/verified-marks";
import {
  createSqliteLocalStore,
  type LocalStore,
} from "./local-store/local-store";
import { createMlsStateStore } from "./local-store/mls-state-store";
import type { MlsEngine } from "./mls/mls-engine";
import type { ServerApiClient } from "./server-api/server-api-client";
import { createLiveSession, type LiveSession } from "./session/live-session";
import type { LiveSocketOpener } from "./session/live-socket";
import type { SessionClock } from "./session/session-clock";
import { createTokenRenewal } from "./session/token-renewal";

export interface AppServicesDependencies {
  readonly database: Database.Database;
  readonly server: ServerApiClient;
  readonly openSocket: LiveSocketOpener;
  readonly clock: SessionClock;
  /** The MLS engine's factory; until #4 builds `@newcord/mls` there is none, and Groups are unavailable. */
  readonly createEngine: (() => MlsEngine) | undefined;
  /** Tells the app's windows about a change on one of the desktop API's event channels. */
  readonly notify: (channel: string, payload?: unknown) => void;
  readonly reportError: (error: unknown) => void;
  /** Electron's global shortcuts, for the mute hotkey (D44c); none in tests. */
  readonly hotkeys?: HotkeyRegistry;
  /** The keyboard hook for push-to-talk (D44b, D74); none until `uiohook-napi` is approved. */
  readonly keyboardHook?: KeyboardHook;
}

/** The main process's services: the desktop API's calls, and a way to stop before quitting. */
export interface AppServices {
  readonly calls: DesktopApiCalls;
  readonly store: LocalStore;
  readonly liveSession: LiveSession;
  /** The Group hub, when the MLS module is there. */
  readonly deviceHub: DeviceHub | undefined;
  stop(): Promise<void>;
}

interface HubHolder {
  hub?: DeviceHub;
}

/**
 * Builds the main process's services on the local database: identity, session, account flows and,
 * when the MLS module is there, Groups (#6).
 * @example const services = startAppServices({ database, server, openSocket, clock, createEngine, notify, reportError });
 */
export function startAppServices(
  dependencies: AppServicesDependencies,
): AppServices {
  const store = createSqliteLocalStore(dependencies.database);
  loadOrCreateIdentityKey(store, createIdentityKeyPair);
  const holder: HubHolder = {};
  const callSettings = createCallSettingsStore(dependencies.database);
  const voiceControls = createVoiceControls({
    ...(dependencies.hotkeys === undefined
      ? {}
      : { hotkeys: dependencies.hotkeys }),
    ...(dependencies.keyboardHook === undefined
      ? {}
      : { keyboardHook: dependencies.keyboardHook }),
    settings: () => callSettings.read(),
    muteToggled: () =>
      dependencies.notify(desktopApiEventChannels.onMuteToggled),
    pushToTalkChanged: (held) =>
      dependencies.notify(desktopApiEventChannels.onPushToTalk, held),
    reportError: dependencies.reportError,
  });
  const liveSession = startLiveSession(dependencies, store, holder);
  holder.hub = createGroupHub(dependencies, store, liveSession, {
    callSettings,
    voiceControls,
  });
  const accountActions = createAccountActions({
    store,
    server: dependencies.server,
    createKeyPair: createIdentityKeyPair,
    liveSession,
  });
  return {
    calls: {
      ...accountActions,
      ...createGroupActions(() => holder.hub?.current()?.groups),
      ...createCallActions(() => holder.hub?.current()?.calls),
      ...createCallSettingsActions(callSettings, voiceControls, (settings) =>
        dependencies.notify(
          desktopApiEventChannels.onCallSettingsChanged,
          settings,
        ),
      ),
    },
    store,
    liveSession,
    deviceHub: holder.hub,
    stop: (): Promise<void> => {
      voiceControls.stop();
      return liveSession.stop();
    },
  };
}

function startLiveSession(
  dependencies: AppServicesDependencies,
  store: LocalStore,
  holder: HubHolder,
): LiveSession {
  const { notify } = dependencies;
  const liveSession = createLiveSession({
    store,
    renewal: createTokenRenewal({ store, server: dependencies.server }),
    openSocket: dependencies.openSocket,
    clock: dependencies.clock,
    events: {
      sessionEnded: () =>
        notify(desktopApiEventChannels.onSessionChanged, sessionStateOf(store)),
      onlineAccountsChanged: (usernames) => {
        notify(desktopApiEventChannels.onOnlineAccountsChanged, usernames);
        holder.hub?.onlineAccountsChanged(usernames);
      },
      envelopeReceived: (envelope) => holder.hub?.envelopeReceived(envelope),
      connectionChanged: (ready) => holder.hub?.connectionChanged(ready),
    },
  });
  if (sessionStateOf(store).status === "logged-in") liveSession.start();
  return liveSession;
}

interface CallParts {
  readonly callSettings: CallSettingsStore;
  readonly voiceControls: VoiceControls;
}

function createGroupHub(
  dependencies: AppServicesDependencies,
  store: LocalStore,
  liveSession: LiveSession,
  { callSettings, voiceControls }: CallParts,
): DeviceHub | undefined {
  const { createEngine, database, notify } = dependencies;
  if (createEngine === undefined) return undefined;
  return createDeviceHub({
    store,
    mlsStateStore: createMlsStateStore(database),
    localGroups: createLocalGroups(database),
    localMessages: createLocalMessages(database),
    verifiedMarks: createVerifiedMarks(database),
    callSettings,
    groupEvents: {
      groupsChanged: () => notify(desktopApiEventChannels.onGroupsChanged),
      invitationsChanged: () =>
        notify(desktopApiEventChannels.onInvitationsChanged),
      messagesChanged: (groupId) =>
        notify(desktopApiEventChannels.onMessagesChanged, groupId),
      groupLeft: (notice) =>
        notify(desktopApiEventChannels.onGroupLeft, notice),
      blocksChanged: () => notify(desktopApiEventChannels.onBlocksChanged),
      callChanged: (call) => {
        voiceControls.callChanged(call);
        notify(desktopApiEventChannels.onCallChanged, call);
      },
      callSignalReceived: (signal) =>
        notify(desktopApiEventChannels.onCallSignal, signal),
    },
    createEngine,
    server: dependencies.server,
    liveSession,
    clock: dependencies.clock,
    reportError: dependencies.reportError,
  });
}
