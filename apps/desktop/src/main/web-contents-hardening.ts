import { isSameAppPage } from "./app-page";

export interface NavigationAttempt {
  readonly url: string;
  preventDefault(): void;
}

export interface WindowOpenRequest {
  readonly url: string;
}

export interface HardenableWebContents {
  on(
    event: "will-frame-navigate",
    listener: (attempt: NavigationAttempt) => void,
  ): unknown;
  setWindowOpenHandler(
    handler: (request: WindowOpenRequest) => { action: "deny" },
  ): void;
}

export interface LinkPolicy {
  readonly appPageUrl: string;
  readonly openInBrowser: (url: string) => void;
}

const browserProtocols = new Set(["http:", "https:"]);

/**
 * The address to open in the default browser for a link the app refused, or undefined to open nothing.
 * @example browserUrlForLink("https://example.com") // "https://example.com/"
 */
export function browserUrlForLink(link: string): string | undefined {
  if (!URL.canParse(link)) return undefined;
  const url = new URL(link);
  return browserProtocols.has(url.protocol) ? url.href : undefined;
}

/**
 * Refuses every new window and every navigation away from the app page; http and https links open in the browser instead.
 * @example app.on("web-contents-created", (_, contents) => hardenWebContents(contents, { appPageUrl, openInBrowser }))
 */
export function hardenWebContents(
  contents: HardenableWebContents,
  links: LinkPolicy,
): void {
  contents.on("will-frame-navigate", (attempt) => {
    // Vite's full-page reload in development is a navigation to the app page itself.
    if (isSameAppPage(attempt.url, links.appPageUrl)) return;
    attempt.preventDefault();
    openIfBrowserLink(attempt.url, links.openInBrowser);
  });
  contents.setWindowOpenHandler((request) => {
    openIfBrowserLink(request.url, links.openInBrowser);
    return { action: "deny" };
  });
}

function openIfBrowserLink(
  link: string,
  openInBrowser: (url: string) => void,
): void {
  const browserUrl = browserUrlForLink(link);
  if (browserUrl !== undefined) openInBrowser(browserUrl);
}
