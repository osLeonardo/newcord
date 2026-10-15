import { app, shell, BrowserWindow, ipcMain, session } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { APP_NAME } from "@newcord/shared";
import icon from "../../resources/icon.png?asset";
import { appPageUrl } from "./app-page";
import { builtInServerAddress } from "./built-in-server-address";
import { appIpcChannels } from "./ipc/app-ipc-channels";
import { isAppIpcSender } from "./ipc/app-ipc-sender";
import {
  registerCheckedIpcHandler,
  type IpcInvocation,
} from "./ipc/checked-ipc-handler";
import { refuseEveryPermission } from "./permissions";
import { hardenWebContents } from "./web-contents-hardening";
import { hardenedWebPreferences } from "./window-preferences";

const pageUrl = appPageUrl({
  isDevelopment: is.dev,
  rendererDevServerUrl: process.env["ELECTRON_RENDERER_URL"],
  rendererHtmlPath: join(__dirname, "../renderer/index.html"),
});
const appWebContentsIds = new Set<number>();

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

function registerAppIpcHandlers(): void {
  for (const channel of appIpcChannels) {
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

  registerAppIpcHandlers();
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
