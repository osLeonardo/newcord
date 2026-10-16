import { app, shell, BrowserWindow, ipcMain, session } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { APP_NAME } from "@newcord/shared";
import Database from "better-sqlite3";
import icon from "../../resources/icon.png?asset";
import type { DesktopApiCalls } from "../preload/desktop-api";
import { appPageUrl } from "./app-page";
import { startAppServices } from "./app-services";
import { builtInServerAddress } from "./built-in-server-address";
import { createAppIpcChannels } from "./ipc/app-ipc-channels";
import { isAppIpcSender } from "./ipc/app-ipc-sender";
import {
  registerCheckedIpcHandler,
  type IpcInvocation,
} from "./ipc/checked-ipc-handler";
import { loadMlsEngineFactory } from "./mls/mls-module";
import { refuseEveryPermission } from "./permissions";
import { createFetchTransport } from "./server-api/fetch-transport";
import { createServerApiClient } from "./server-api/server-api-client";
import { createStandardSocketOpener } from "./session/live-socket";
import { systemSessionClock } from "./session/session-clock";
import { hardenWebContents } from "./web-contents-hardening";
import { hardenedWebPreferences } from "./window-preferences";

const pageUrl = appPageUrl({
  isDevelopment: is.dev,
  rendererDevServerUrl: process.env["ELECTRON_RENDERER_URL"],
  rendererHtmlPath: join(__dirname, "../renderer/index.html"),
});
const appWebContentsIds = new Set<number>();
// The local database lives in Electron's per-user data directory (D20, 08-m1-build step 7).
const LOCAL_DATABASE_FILE_NAME = "device.db";

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: hardenedWebPreferences(
      join(__dirname, "../preload/index.js"),
    ),
  });
  trackAppWebContents(mainWindow);

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  void mainWindow.loadURL(pageUrl);
}

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
function startServices(): DesktopApiCalls {
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
  });
  app.once("will-quit", () => {
    void services.stop();
    database.close();
  });
  return services.calls;
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

app.enableSandbox();
app.on("web-contents-created", (_, contents) => {
  hardenWebContents(contents, { appPageUrl: pageUrl, openInBrowser });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
void app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.newcord.desktop");
  refuseEveryPermission(session.defaultSession);

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerAppIpcHandlers(startServices());
  createWindow();
  console.log(`${APP_NAME} desktop ready, server ${builtInServerAddress}`);

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
