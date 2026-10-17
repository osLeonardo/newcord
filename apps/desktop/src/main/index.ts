import {
  app,
  shell,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  session,
  Tray,
  type DesktopCapturerSource,
} from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { APP_NAME } from "@newcord/shared";
import Database from "better-sqlite3";
import icon from "../../resources/icon.png?asset";
import type { CallSummary } from "../preload/call-api";
import {
  desktopApiEventChannels,
  type DesktopApiCalls,
} from "../preload/desktop-api";
import type { CallMediaReport } from "../preload/shell-api";
import {
  closeDecision,
  firstHide,
  HIDDEN_START_ARGUMENT,
  setUpFirstRun,
  startsHidden,
  type LoginItems,
} from "./app-shell/app-closing";
import type { NotificationPort } from "./app-shell/message-notices";
import { trayItems, type TrayAction } from "./app-shell/tray-menu";
import type { AppServices } from "./app-services";
import { appPageUrl } from "./app-page";
import { startAppServices } from "./app-services";
import { builtInServerAddress } from "./built-in-server-address";
import { localDataFolderName } from "./local-data-folder";
import { createAppIpcChannels } from "./ipc/app-ipc-channels";
import { isAppIpcSender } from "./ipc/app-ipc-sender";
import {
  registerCheckedIpcHandler,
  type IpcInvocation,
} from "./ipc/checked-ipc-handler";
import { createShareChooser } from "./calls/screen-share";
import { createUiohookKeyboardHook } from "./calls/uiohook-keyboard-hook";
import { describeMlsModule, loadMlsEngineFactory } from "./mls/mls-module";
import { grantCallPermissionsOnly } from "./permissions";
import { createFetchTransport } from "./server-api/fetch-transport";
import { createServerApiClient } from "./server-api/server-api-client";
import { createStandardSocketOpener } from "./session/live-socket";
import { systemSessionClock } from "./session/session-clock";
import { hardenWebContents } from "./web-contents-hardening";
import { hideOnClose, showAgain } from "./window-closing";
import { createElectronUpdateSource } from "./updates/electron-update-source";
import {
  createUpdateService,
  type UpdateService,
} from "./updates/update-service";
import { hardenedWebPreferences } from "./window-preferences";

const pageUrl = appPageUrl({
  isDevelopment: is.dev,
  rendererDevServerUrl: process.env["ELECTRON_RENDERER_URL"],
  rendererHtmlPath: join(__dirname, "../renderer/index.html"),
});
const appWebContentsIds = new Set<number>();
// The local database lives in Electron's per-user data directory (D20, 08-m1-build step 7).
const LOCAL_DATABASE_FILE_NAME = "device.db";
// The app's own picker shows these thumbnails (10-m3-build step 7).
const SHARE_THUMBNAIL_SIZE = { width: 320, height: 180 };
const shareChooser = createShareChooser<DesktopCapturerSource>({
  list: async () =>
    (
      await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: SHARE_THUMBNAIL_SIZE,
      })
    ).map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      source,
    })),
});
let mainWindow: BrowserWindow | undefined;
let quitting = false;
let tray: Tray | undefined;
const trayState = { inCall: false, muted: false };
let callGroupId: string | undefined;
// Only the installed app updates itself; in development the executable is Electron itself (#13).
let updates: UpdateService | undefined;

// In development the executable is Electron itself, which must not start at login.
const loginItems: LoginItems = {
  set: (openAtLogin) => {
    if (!app.isPackaged) return;
    app.setLoginItemSettings({ openAtLogin, args: [HIDDEN_START_ARGUMENT] });
  },
};

function createWindow(services: AppServices, startHidden: boolean): void {
  // Create the browser window.
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: hardenedWebPreferences(
      join(__dirname, "../preload/index.js"),
    ),
  });
  trackAppWebContents(window);
  // Closing hides the window to the tray, so messages and Calls keep running (D42, D15b).
  hideOnClose(window, {
    decide: () =>
      closeDecision({
        quitting,
        quitOnClose: services.deviceSettings.read().quitOnClose,
      }),
    hidden: () => {
      if (firstHide(services.flags)) showStillRunningNotice();
    },
  });

  // Notifications skip the Group open in the focused window (#10's spec).
  const focusChanged = (): void => {
    services.windowFocusChanged(window.isVisible() && window.isFocused());
  };
  for (const event of ["focus", "blur", "show", "hide"] as const) {
    window.on(event as "focus", focusChanged);
  }

  window.on("ready-to-show", () => {
    // Started at login, the app opens hidden in the tray (D46).
    if (!startHidden) window.show();
  });

  void window.loadURL(pageUrl);
  mainWindow = window;
}

/** The one-time notice of the first hide (D47). */
function showStillRunningNotice(): void {
  new Notification({
    title: `${APP_NAME} is still running`,
    body: "It stays in the tray so you keep getting messages and stay in Calls. Open it again from the tray icon.",
  }).show();
}

function showMainWindow(services: AppServices): void {
  if (mainWindow === undefined || mainWindow.isDestroyed()) {
    createWindow(services, false);
    return;
  }
  showAgain(mainWindow);
}

function createTray(services: AppServices): void {
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.on("click", () => {
    showMainWindow(services);
  });
  refreshTray(services);
}

function refreshTray(services: AppServices): void {
  tray?.setContextMenu(
    Menu.buildFromTemplate(
      trayItems(trayState).flatMap((item) => [
        ...(item.action === "quit" ? [{ type: "separator" as const }] : []),
        {
          label: item.label,
          enabled: item.enabled,
          click: (): void => {
            runTrayAction(services, item.action);
          },
        },
      ]),
    ),
  );
}

function runTrayAction(services: AppServices, action: TrayAction): void {
  switch (action) {
    case "open":
      showMainWindow(services);
      return;
    case "toggle-mute":
      sendToAppWindows(desktopApiEventChannels.onMuteToggled);
      return;
    case "quit":
      // Quit works even during a Call (#10's spec).
      app.quit();
  }
}

/** One notification per Group; a new message replaces the Group's last one (11-m4-build Settings). */
const shownNotifications = new Map<string, Notification>();

function notificationPort(services: () => AppServices): NotificationPort {
  return {
    show: (groupId, content): void => {
      shownNotifications.get(groupId)?.close();
      const notification = new Notification(content);
      notification.on("click", () => {
        showMainWindow(services());
        // Clicking opens the window on that Group (11-m4-build step 7).
        sendToAppWindows(desktopApiEventChannels.onOpenGroup, groupId);
      });
      shownNotifications.set(groupId, notification);
      notification.show();
    },
    close: (groupId): void => {
      shownNotifications.get(groupId)?.close();
      shownNotifications.delete(groupId);
    },
  };
}

/** The tray follows whether this Device is in a Call and muted. */
const shellEvents = {
  callChanged: (services: AppServices, call: CallSummary): void => {
    if (call.joined) {
      callGroupId = call.groupId;
      trayState.inCall = true;
    } else if (callGroupId === call.groupId) {
      callGroupId = undefined;
      trayState.inCall = false;
      trayState.muted = false;
    }
    refreshTray(services);
    updates?.callChanged(trayState.inCall);
  },
  callMediaChanged: (services: AppServices, report: CallMediaReport): void => {
    trayState.muted = report.muted;
    refreshTray(services);
  },
};

function trackAppWebContents(window: BrowserWindow): void {
  const webContentsId = window.webContents.id;
  appWebContentsIds.add(webContentsId);
  window.webContents.once("destroyed", () => {
    appWebContentsIds.delete(webContentsId);
  });
}

function isTrustedIpcSender(invocation: IpcInvocation): boolean {
  return isAppIpcSender(invocation, {
    pageUrl,
    isAppWebContents: (webContentsId) => appWebContentsIds.has(webContentsId),
  });
}

/** Sends a change to every window of the app, and to nothing else. */
function sendToAppWindows(channel: string, payload?: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (appWebContentsIds.has(window.webContents.id)) {
      window.webContents.send(channel, payload);
    }
  }
}

/** Opens the local database and starts the main process's services on it. */
function startServices(): AppServices {
  const database = new Database(
    join(app.getPath("userData"), LOCAL_DATABASE_FILE_NAME),
  );
  const services = startAppServices({
    database,
    server: createServerApiClient(
      createFetchTransport(builtInServerAddress, fetch),
    ),
    openSocket: createStandardSocketOpener(
      builtInServerAddress,
      (url) => new WebSocket(url),
    ),
    clock: systemSessionClock,
    createEngine: loadMlsEngineFactory(),
    notify: sendToAppWindows,
    reportError: (error) => {
      console.error("A background task failed", error);
    },
    keyboardHook: createUiohookKeyboardHook(),
    hotkeys: {
      register: (accelerator, pressed) =>
        globalShortcut.register(accelerator, pressed),
      unregister: (accelerator) => {
        globalShortcut.unregister(accelerator);
      },
    },
    shareSources: {
      listShareSources: () => shareChooser.listSources(),
      chooseShareSource: (sourceId) =>
        Promise.resolve(shareChooser.choose(sourceId)),
    },
    processCpu: () =>
      app.getAppMetrics().map((metric) => ({
        type: metric.type,
        percentCpu: metric.cpu.percentCPUUsage,
      })),
    notifications: notificationPort(() => services),
    ...(updates === undefined ? {} : { updates }),
    shell: {
      callChanged: (call) => {
        shellEvents.callChanged(services, call);
      },
      callMediaChanged: (report) => {
        shellEvents.callMediaChanged(services, report);
      },
      settingsChanged: (settings) => {
        loginItems.set(settings.startAtLogin);
      },
    },
  });
  app.once("will-quit", () => {
    updates?.stop();
    void services.stop();
    database.close();
  });
  return services;
}

/** Checks GitHub Releases at start-up and every 6 hours, never restarting during a Call (#13). */
function createAppUpdates(): UpdateService {
  return createUpdateService({
    source: createElectronUpdateSource((error) => {
      console.error("Checking for or downloading an update failed", error);
    }),
    clock: systemSessionClock,
    offerChanged: (offered) => {
      sendToAppWindows(desktopApiEventChannels.onUpdateOfferChanged, offered);
    },
  });
}

function registerAppIpcHandlers(calls: DesktopApiCalls): void {
  for (const channel of createAppIpcChannels(calls)) {
    registerCheckedIpcHandler(ipcMain, isTrustedIpcSender, channel);
  }
}

function openInBrowser(url: string): void {
  shell.openExternal(url).catch((error: unknown) => {
    console.error(`Could not open ${url} in the default browser`, error);
  });
}

// Set before anything opens the folder, the single-instance lock included (D95).
app.setPath(
  "userData",
  join(app.getPath("appData"), localDataFolderName(app.isPackaged)),
);

// Launching the app again shows the running one's window (#9's spec).
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) app.quit();
app.on("second-instance", () => {
  if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
    showAgain(mainWindow);
  }
});
app.on("before-quit", () => {
  quitting = true;
});

app.enableSandbox();
app.on("web-contents-created", (_, contents) => {
  hardenWebContents(contents, { appPageUrl: pageUrl, openInBrowser });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
void app.whenReady().then(() => {
  // A second launch only woke the first one up and is quitting.
  if (!isFirstInstance) return;
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.newcord.desktop");
  grantCallPermissionsOnly(session.defaultSession, (webContentsId) =>
    appWebContentsIds.has(webContentsId),
  );
  // A share captures only the source picked in the app's own picker, and never sound (D43).
  session.defaultSession.setDisplayMediaRequestHandler((_request, answer) => {
    const source = shareChooser.take();
    answer(source === undefined ? {} : { video: source });
  });

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  if (app.isPackaged) updates = createAppUpdates();
  const services = startServices();
  registerAppIpcHandlers(services.calls);
  setUpFirstRun(services.flags, loginItems);
  createTray(services);
  createWindow(services, startsHidden(process.argv));
  console.log(`${APP_NAME} desktop ready, server ${builtInServerAddress}`);
  console.log(describeMlsModule());
  updates?.start();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(services, false);
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
