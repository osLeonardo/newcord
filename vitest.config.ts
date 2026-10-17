import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    projects: [
      { extends: true, test: { name: "desktop", root: "apps/desktop" } },
      // The desktop's integration tests again, with the real MLS module in every installation.
      {
        extends: true,
        test: {
          name: "desktop-real-mls",
          root: "apps/desktop",
          include: ["test/**/*-server.test.ts"],
          env: { NEWCORD_TEST_MLS: "real" },
        },
      },
      { extends: true, test: { name: "server", root: "apps/server" } },
      { extends: true, test: { name: "shared", root: "packages/shared" } },
      { extends: true, test: { name: "mls", root: "packages/mls" } },
    ],
  },
});
