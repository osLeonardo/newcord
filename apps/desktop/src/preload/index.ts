import { contextBridge } from "electron";
import type { DesktopApi } from "./desktop-api";

const desktopApi: DesktopApi = {};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
