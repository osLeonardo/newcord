import type { PluginOption } from "vite";
import { describe, expect, it } from "vitest";
import { createDesktopBuildConfig } from "../electron.vite.config";

const sharedPackageName = "@newcord/shared";
const releaseBuild = createDesktopBuildConfig({
  command: "build",
  mode: "production",
});
const developmentBuild = createDesktopBuildConfig({
  command: "serve",
  mode: "development",
});

function pluginNames(option: PluginOption): string[] {
  if (Array.isArray(option)) return option.flatMap(pluginNames);
  if (option && "name" in option && typeof option.name === "string") {
    return [option.name];
  }
  return [];
}

describe.each([
  { processName: "main", processConfig: releaseBuild.main },
  { processName: "preload", processConfig: releaseBuild.preload },
])("the $processName build", ({ processConfig }) => {
  const externalizeDeps = processConfig?.build?.externalizeDeps;
  const excludedPackages =
    typeof externalizeDeps === "object" ? externalizeDeps.exclude : undefined;

  it("bundles @newcord/shared instead of importing it at run time", () => {
    expect(excludedPackages).toContain(sharedPackageName);
  });

  it("keeps every other runtime dependency external", () => {
    expect(externalizeDeps).toEqual({ exclude: [sharedPackageName] });
  });
});

describe("the built-in server address", () => {
  it("is the local server in development builds", () => {
    expect(developmentBuild.main?.define).toEqual({
      BUILT_IN_SERVER_ADDRESS: JSON.stringify("http://localhost:3000"),
    });
  });

  it("is an https address in release builds", () => {
    expect(releaseBuild.main?.define?.["BUILT_IN_SERVER_ADDRESS"]).toMatch(
      /^"https:\/\//,
    );
  });

  it("fails the build when it is plain http to another machine", () => {
    expect(() =>
      createDesktopBuildConfig(
        { command: "build", mode: "production" },
        {
          development: "http://localhost:3000",
          release: "http://newcord.duckdns.org",
        },
      ),
    ).toThrow("http://newcord.duckdns.org");
  });
});

describe.each([
  { buildName: "release", rendererConfig: releaseBuild.renderer },
  { buildName: "development", rendererConfig: developmentBuild.renderer },
])("the $buildName renderer", ({ rendererConfig }) => {
  const names = pluginNames(rendererConfig?.plugins ?? []);

  it("adds the Content Security Policy to its page", () => {
    expect(names).toContain("desktop:content-security-policy");
  });

  it("is styled with Tailwind CSS through its Vite plugin", () => {
    expect(names.some((name) => name.startsWith("@tailwindcss/vite"))).toBe(
      true,
    );
  });
});
