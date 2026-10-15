import type { WebPreferences } from "electron";

/**
 * The web preferences of every app window: context isolation and the sandbox on, Node.js off.
 * @example new BrowserWindow({ webPreferences: hardenedWebPreferences(preloadPath) })
 */
export function hardenedWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
  };
}
