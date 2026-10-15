import { pathToFileURL } from "node:url";

export interface AppPageSources {
  readonly isDevelopment: boolean;
  readonly rendererDevServerUrl: string | undefined;
  readonly rendererHtmlPath: string;
}

/**
 * The address of the app's page, which windows load and IPC senders must show.
 * @example appPageUrl({ isDevelopment: is.dev, rendererDevServerUrl: process.env["ELECTRON_RENDERER_URL"], rendererHtmlPath })
 */
export function appPageUrl(sources: AppPageSources): string {
  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (sources.isDevelopment && sources.rendererDevServerUrl) {
    return new URL(sources.rendererDevServerUrl).href;
  }
  return pathToFileURL(sources.rendererHtmlPath).href;
}

/**
 * Whether an address shows the app's page, ignoring its query and fragment.
 * @example isSameAppPage("http://localhost:5173/#/login", "http://localhost:5173/") // true
 */
export function isSameAppPage(url: string, pageUrl: string): boolean {
  if (!URL.canParse(url) || !URL.canParse(pageUrl)) return false;
  const candidate = new URL(url);
  const page = new URL(pageUrl);
  return (
    candidate.protocol === page.protocol &&
    candidate.host === page.host &&
    candidate.pathname === page.pathname
  );
}
