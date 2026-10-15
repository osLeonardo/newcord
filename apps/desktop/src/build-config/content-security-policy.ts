import { createHash } from "node:crypto";
import type { HtmlTagDescriptor, Plugin } from "vite";

type PolicyDirectives = Readonly<Record<string, readonly string[]>>;

export interface DevelopmentPage {
  readonly inlineScripts: readonly string[];
  readonly devServerUrl: string | undefined;
}

export interface HtmlTransformContextWithServer {
  readonly server?: {
    readonly resolvedUrls: { readonly local: readonly string[] } | null;
  };
}

export interface ContentSecurityPolicyPlugin extends Plugin {
  readonly transformIndexHtml: {
    readonly order: "post";
    readonly handler: (
      html: string,
      context: HtmlTransformContextWithServer,
    ) => HtmlTagDescriptor[];
  };
}

const appOnlyDirectives: PolicyDirectives = {
  "default-src": ["'none'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'", "data:"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
};

const inlineScriptPattern =
  /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * The policy of every built page: scripts and styles only from the app, no inline code, no eval, no network.
 * @example releaseContentSecurityPolicy() // "default-src 'none'; script-src 'self'; ..."
 */
export function releaseContentSecurityPolicy(): string {
  return serializePolicy(appOnlyDirectives);
}

/**
 * The policy of the page the dev server serves: adds inline styles, the page's own inline scripts by hash, and the dev server's live-reload socket.
 * @example developmentContentSecurityPolicy({ inlineScripts: [], devServerUrl: "http://localhost:5173/" })
 */
export function developmentContentSecurityPolicy(
  page: DevelopmentPage,
): string {
  return serializePolicy({
    ...appOnlyDirectives,
    "script-src": ["'self'", ...page.inlineScripts.map(sha256Source)],
    "style-src": ["'self'", "'unsafe-inline'"],
    "connect-src": ["'self'", ...liveReloadSocketOrigins(page.devServerUrl)],
  });
}

/**
 * The contents of every inline script in a page, in order.
 * @example inlineScriptsIn("<script>run()</script>") // ["run()"]
 */
export function inlineScriptsIn(html: string): string[] {
  return Array.from(html.matchAll(inlineScriptPattern), (match) => match[1]);
}

/**
 * A Vite plugin that puts the policy in a meta tag at the top of the page, which applies to file:// pages too.
 * @example contentSecurityPolicyPlugin(env.command)
 */
export function contentSecurityPolicyPlugin(
  command: "build" | "serve",
): ContentSecurityPolicyPlugin {
  return {
    name: "desktop:content-security-policy",
    transformIndexHtml: {
      order: "post",
      handler: (html, context) => [
        contentSecurityPolicyTag(policyForPage(command, html, context)),
      ],
    },
  };
}

function policyForPage(
  command: "build" | "serve",
  html: string,
  context: HtmlTransformContextWithServer,
): string {
  if (command !== "serve") return releaseContentSecurityPolicy();
  return developmentContentSecurityPolicy({
    inlineScripts: inlineScriptsIn(html),
    devServerUrl: context.server?.resolvedUrls?.local[0],
  });
}

function contentSecurityPolicyTag(policy: string): HtmlTagDescriptor {
  return {
    tag: "meta",
    attrs: { "http-equiv": "Content-Security-Policy", content: policy },
    injectTo: "head-prepend",
  };
}

function serializePolicy(directives: PolicyDirectives): string {
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

function sha256Source(script: string): string {
  const digest = createHash("sha256").update(script, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

function liveReloadSocketOrigins(devServerUrl: string | undefined): string[] {
  if (devServerUrl === undefined || !URL.canParse(devServerUrl)) return [];
  const { protocol, host } = new URL(devServerUrl);
  return [`${protocol === "https:" ? "wss:" : "ws:"}//${host}`];
}
