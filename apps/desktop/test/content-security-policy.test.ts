import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicyPlugin,
  developmentContentSecurityPolicy,
  inlineScriptsIn,
  releaseContentSecurityPolicy,
} from "../src/build-config/content-security-policy";

const preamble = "window.preamble = true;";
const preambleHash = "'sha256-O+uS55TvMi0tngH1MGceXHD55/1Shm3T7efvochN424='";
const devServerUrl = "http://localhost:5173/";
const pageWithPreamble = `<!doctype html><html><head><script type="module">${preamble}</script><script type="module" src="/@vite/client"></script></head><body><script type="module" src="/src/main.tsx"></script></body></html>`;
const unsafeSources = ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'"];

function parsePolicy(policy: string): Map<string, string[]> {
  const directives = policy.split(";").map((part) => part.trim().split(/\s+/));
  return new Map(directives.map(([name = "", ...sources]) => [name, sources]));
}

function sourcesFor(policy: string, directive: string): string[] {
  const directives = parsePolicy(policy);
  return directives.get(directive) ?? directives.get("default-src") ?? [];
}

function allSources(policy: string): string[] {
  return [...parsePolicy(policy).values()].flat();
}

function unsafeSourcesIn(sources: string[]): string[] {
  return sources.filter((source) => unsafeSources.includes(source));
}

describe("releaseContentSecurityPolicy", () => {
  const policy = releaseContentSecurityPolicy();

  it("denies everything not listed", () => {
    expect(parsePolicy(policy).get("default-src")).toEqual(["'none'"]);
  });

  it("allows scripts and styles only from the app itself", () => {
    expect(sourcesFor(policy, "script-src")).toEqual(["'self'"]);
    expect(sourcesFor(policy, "style-src")).toEqual(["'self'"]);
  });

  it("never allows inline code or eval", () => {
    expect(unsafeSourcesIn(allSources(policy))).toEqual([]);
  });

  it("allows no remote source anywhere", () => {
    expect(allSources(policy).filter((source) => source.includes(":"))).toEqual(
      ["data:"],
    );
  });

  it("gives the interface no network connections", () => {
    expect(sourcesFor(policy, "connect-src")).toEqual(["'none'"]);
  });

  it("blocks base URL changes and form submissions", () => {
    expect(sourcesFor(policy, "base-uri")).toEqual(["'none'"]);
    expect(sourcesFor(policy, "form-action")).toEqual(["'none'"]);
  });
});

describe("developmentContentSecurityPolicy", () => {
  const policy = developmentContentSecurityPolicy({
    inlineScripts: [preamble],
    devServerUrl,
  });

  it("allows inline styles, which Vite injects for live reloading", () => {
    expect(sourcesFor(policy, "style-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
    ]);
  });

  it("allows the page's inline scripts only by their hash", () => {
    expect(sourcesFor(policy, "script-src")).toEqual(["'self'", preambleHash]);
  });

  it("never allows eval or arbitrary inline scripts", () => {
    expect(unsafeSourcesIn(sourcesFor(policy, "script-src"))).toEqual([]);
  });

  it("allows the dev server and its live-reload socket", () => {
    expect(sourcesFor(policy, "connect-src")).toEqual([
      "'self'",
      "ws://localhost:5173",
    ]);
  });

  it("uses a secure socket for a dev server on https", () => {
    const securePolicy = developmentContentSecurityPolicy({
      inlineScripts: [],
      devServerUrl: "https://localhost:5173/",
    });

    expect(sourcesFor(securePolicy, "connect-src")).toEqual([
      "'self'",
      "wss://localhost:5173",
    ]);
  });

  it("allows only the page itself when the dev server address is unknown", () => {
    const policyWithoutServer = developmentContentSecurityPolicy({
      inlineScripts: [],
      devServerUrl: undefined,
    });

    expect(sourcesFor(policyWithoutServer, "connect-src")).toEqual(["'self'"]);
    expect(sourcesFor(policyWithoutServer, "script-src")).toEqual(["'self'"]);
  });
});

describe("inlineScriptsIn", () => {
  it("returns the contents of inline scripts only", () => {
    expect(inlineScriptsIn(pageWithPreamble)).toEqual([preamble]);
  });

  it("finds every inline script, whatever its attributes", () => {
    const page = `<script>console.log(1);</script><SCRIPT type="module">${preamble}</SCRIPT>`;

    expect(inlineScriptsIn(page)).toEqual(["console.log(1);", preamble]);
  });

  it("returns nothing for a page without inline scripts", () => {
    expect(
      inlineScriptsIn('<script type="module" src="./index.js"></script>'),
    ).toEqual([]);
  });
});

describe("contentSecurityPolicyPlugin", () => {
  const devServerContext = {
    server: { resolvedUrls: { local: [devServerUrl], network: [] } },
  };

  it("adds the release policy as the first tag of every built page", () => {
    const plugin = contentSecurityPolicyPlugin("build");

    expect(plugin.transformIndexHtml.order).toBe("post");
    expect(plugin.transformIndexHtml.handler(pageWithPreamble, {})).toEqual([
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: releaseContentSecurityPolicy(),
        },
        injectTo: "head-prepend",
      },
    ]);
  });

  it("adds the development policy for the page the dev server serves", () => {
    const plugin = contentSecurityPolicyPlugin("serve");
    const [tag] = plugin.transformIndexHtml.handler(
      pageWithPreamble,
      devServerContext,
    );

    expect(tag?.attrs?.content).toBe(
      developmentContentSecurityPolicy({
        inlineScripts: [preamble],
        devServerUrl,
      }),
    );
  });
});
