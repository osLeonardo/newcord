import type { DesktopApi } from "./desktop-api";

declare global {
  interface Window {
    readonly desktopApi: DesktopApi;
  }
}
