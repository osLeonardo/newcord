import { contextBridge, ipcRenderer } from "electron";
import { createDesktopApi } from "./desktop-api-bridge";

const desktopApi = createDesktopApi((channel, ...args) =>
  ipcRenderer.invoke(channel, ...args),
);

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
