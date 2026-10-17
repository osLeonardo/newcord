import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appPageUrl, isSameAppPage } from "../src/main/app-page";
import { hardenedWebPreferences } from "../src/main/window-preferences";

const rendererHtmlPath = resolve("out", "renderer", "index.html");

describe("hardenedWebPreferences", () => {
  const preferences = hardenedWebPreferences("/app/out/preload/index.js");

  it("keeps context isolation and the sandbox on", () => {
    expect(preferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
    });
  });

  it("keeps Node.js off in the page, its workers and its frames", () => {
    expect(preferences).toMatchObject({
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
    });
  });

  it("keeps web security on and webviews off", () => {
    expect(preferences).toMatchObject({
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });

  it("loads the given preload", () => {
    expect(preferences.preload).toBe("/app/out/preload/index.js");
  });
});

describe("appPageUrl", () => {
  it("uses the dev server in development", () => {
    expect(
      appPageUrl({
        isDevelopment: true,
        rendererDevServerUrl: "http://localhost:5173",
        rendererHtmlPath,
      }),
    ).toBe("http://localhost:5173/");
  });

  it("uses the built page when no dev server is running", () => {
    const pageUrl = appPageUrl({
      isDevelopment: true,
      rendererDevServerUrl: undefined,
      rendererHtmlPath,
    });

    expect(pageUrl).toMatch(/^file:\/\/\/.*\/out\/renderer\/index\.html$/);
  });

  it("ignores a dev server address outside development", () => {
    const pageUrl = appPageUrl({
      isDevelopment: false,
      rendererDevServerUrl: "https://evil.example/",
      rendererHtmlPath,
    });

    expect(pageUrl).toMatch(/^file:\/\/\/.*\/out\/renderer\/index\.html$/);
  });
});

describe("isSameAppPage", () => {
  const devPageUrl = "http://localhost:5173/";
  const releasePageUrl = "file:///C:/newcord/out/renderer/index.html";

  it.each([
    [devPageUrl, devPageUrl],
    [devPageUrl, "http://localhost:5173"],
    [devPageUrl, "http://localhost:5173/?reload=1#top"],
    [releasePageUrl, `${releasePageUrl}#/login`],
  ])("matches %s with %s", (pageUrl, url) => {
    expect(isSameAppPage(url, pageUrl)).toBe(true);
  });

  it.each([
    [devPageUrl, "https://localhost:5173/"],
    [devPageUrl, "http://localhost:5174/"],
    [devPageUrl, "http://127.0.0.1:5173/"],
    [releasePageUrl, "file:///C:/newcord/out/renderer/other.html"],
    [releasePageUrl, "not a url"],
    ["not a url", "not a url"],
  ])("does not match %s with %s", (pageUrl, url) => {
    expect(isSameAppPage(url, pageUrl)).toBe(false);
  });
});
