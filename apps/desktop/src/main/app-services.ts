import type Database from "better-sqlite3";
import {
  desktopApiEventChannels,
  type DesktopApiCalls,
} from "../preload/desktop-api";
import { createAccountActions } from "./account/account-actions";
import { sessionStateOf } from "./account/session-state";
import { createCallActions, createSettingsActions } from "./calls/call-actions";
import {
  createVoiceControls,
  type HotkeyRegistry,
  type KeyboardHook,
  type VoiceControls,
} from "./calls/voice-controls";
import {
  createSettingsStore,
  type SettingsStore,
} from "./local-store/device-settings";
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
import type {
  DiagnosticsApiCalls,
  ScreenShareApiCalls,
} from "../preload/call-api";
import type { SettingsApiCalls } from "../preload/settings-api";
import {
  createShellActions,
  type AppShellEvents,
} from "./app-shell/shell-actions";
import { createAppFlags, type AppFlags } from "./local-store/app-flags";
import {
  isInView,
  noticeContent,
  type NotificationPort,
  type ViewState,
} from "./app-shell/message-notices";
import { measureCpu, type ProcessCpu } from "./calls/cpu-measurement";
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
  /** The app's own screen-share picker over Electron's `desktopCapturer`; none in tests. */
  readonly shareSources?: ScreenShareApiCalls;
  /** Each process's CPU use since the last reading, from `app.getAppMetrics()`; none in tests. */
  readonly processCpu?: () => readonly ProcessCpu[];
  /** The tray, login items and notifications of the Electron app; none in tests. */
  readonly shell?: AppShellEvents;
  /** Windows notifications for new messages (#10's spec); none in tests. */
  readonly notifications?: NotificationPort;
}

/** The main process's services: the desktop API's calls, and a way to stop before quitting. */
export interface AppServices {
  readonly calls: DesktopApiCalls;
  readonly store: LocalStore;
  readonly deviceSettings: SettingsStore;
  readonly flags: AppFlags;
  /** The window gained or lost the focus, or was shown or hidden. */
  windowFocusChanged(focused: boolean): void;
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
  const view: ViewState = { windowFocused: false, sharing: false };
  const groupViewed = (groupId: string): void => {
    holder.hub?.current()?.groups.markRead(groupId);
    dependencies.notifications?.close(groupId);
  };
  const deviceSettings = createSettingsStore(dependencies.database);
  const voiceControls = createVoiceControls({
    ...(dependencies.hotkeys === undefined
      ? {}
      : { hotkeys: dependencies.hotkeys }),
    ...(dependencies.keyboardHook === undefined
      ? {}
      : { keyboardHook: dependencies.keyboardHook }),
    settings: () => deviceSettings.read(),
    muteToggled: () =>
      dependencies.notify(desktopApiEventChannels.onMuteToggled),
    pushToTalkChanged: (held) =>
      dependencies.notify(desktopApiEventChannels.onPushToTalk, held),
    reportError: dependencies.reportError,
  });
  const liveSession = startLiveSession(dependencies, store, holder);
  holder.hub = createGroupHub(dependencies, store, liveSession, {
    deviceSettings,
    voiceControls,
    view,
  });
  const accountActions = createAccountActions({
    store,
    server: dependencies.server,
    createKeyPair: createIdentityKeyPair,
    liveSession,
  });
  const flags = createAppFlags(dependencies.database);
  return {
    calls: {
      ...accountActions,
      ...createGroupActions(() => holder.hub?.current()?.groups),
      ...createCallActions(() => holder.hub?.current()?.calls),
      ...deviceActions(dependencies, { deviceSettings, voiceControls }),
      ...createShellActions({
        flags,
        settings: deviceSettings,
        shell: dependencies.shell,
        view,
        groupViewed,
      }),
    },
    store,
    deviceSettings,
    flags,
    windowFocusChanged: (focused): void => {
      view.windowFocused = focused;
      if (focused && view.viewedGroup !== undefined) {
        groupViewed(view.viewedGroup);
      }
    },
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

/** The calls that belong to this computer rather than an Account: settings, sharing, measuring. */
function deviceActions(
  dependencies: AppServicesDependencies,
  parts: Pick<CallParts, "deviceSettings" | "voiceControls">,
): SettingsApiCalls & ScreenShareApiCalls & DiagnosticsApiCalls {
  const { notify, shareSources, processCpu, shell } = dependencies;
  return {
    ...createSettingsActions(
      parts.deviceSettings,
      parts.voiceControls,
      (settings) => {
        notify(desktopApiEventChannels.onSettingsChanged, settings);
        shell?.settingsChanged(settings);
      },
    ),
    listShareSources: () =>
      shareSources?.listShareSources() ?? Promise.resolve([]),
    chooseShareSource: (sourceId) =>
      shareSources?.chooseShareSource(sourceId) ?? Promise.resolve(false),
    measureCpu: (seconds) =>
      measureCpu(
        processCpu ?? ((): ProcessCpu[] => []),
        seconds,
        (milliseconds) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds)),
      ),
  };
}

interface CallParts {
  readonly deviceSettings: SettingsStore;
  readonly voiceControls: VoiceControls;
  readonly view: ViewState;
}

function createGroupHub(
  dependencies: AppServicesDependencies,
  store: LocalStore,
  liveSession: LiveSession,
  { deviceSettings, voiceControls, view }: CallParts,
): DeviceHub | undefined {
  const { createEngine, database, notify } = dependencies;
  if (createEngine === undefined) return undefined;
  return createDeviceHub({
    store,
    mlsStateStore: createMlsStateStore(database),
    localGroups: createLocalGroups(database),
    localMessages: createLocalMessages(database),
    verifiedMarks: createVerifiedMarks(database),
    deviceSettings,
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
        dependencies.shell?.callChanged(call);
        notify(desktopApiEventChannels.onCallChanged, call);
      },
      callSignalReceived: (signal) =>
        notify(desktopApiEventChannels.onCallSignal, signal),
      chatMessageArrived: (message) => {
        dependencies.notifications?.show(
          message.groupId,
          noticeContent(
            deviceSettings.read().previewMode,
            view.sharing,
            message,
          ),
        );
      },
    },
    createEngine,
    server: dependencies.server,
    liveSession,
    clock: dependencies.clock,
    reportError: dependencies.reportError,
    inView: (groupId) => isInView(view, groupId),
  });
}
