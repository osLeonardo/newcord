import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { createDesktopApi, type IpcSubscribe } from "./desktop-api-bridge";

const subscribe: IpcSubscribe = (channel, listener) => {
  const forwardPayload = (_event: IpcRendererEvent, payload: unknown): void =>
    listener(payload);
  ipcRenderer.on(channel, forwardPayload);
  return (): void => {
    ipcRenderer.removeListener(channel, forwardPayload);
  };
};

const desktopApi = createDesktopApi(
  (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  subscribe,
);

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
