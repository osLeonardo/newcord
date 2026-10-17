import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    projects: [
      { extends: true, test: { name: "desktop", root: "apps/desktop" } },
      { extends: true, test: { name: "server", root: "apps/server" } },
      { extends: true, test: { name: "shared", root: "packages/shared" } },
      { extends: true, test: { name: "mls", root: "packages/mls" } },
    ],
  },
});
