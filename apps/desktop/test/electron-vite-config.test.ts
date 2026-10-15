import { describe, expect, it } from "vitest";
import electronViteConfig from "../electron.vite.config";

const sharedPackageName = "@newcord/shared";

describe.each([
  { processName: "main", processConfig: electronViteConfig.main },
  { processName: "preload", processConfig: electronViteConfig.preload },
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
