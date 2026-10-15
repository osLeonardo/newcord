import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

// @newcord/shared ships TypeScript source, so it cannot be loaded at run time.
const bundledWorkspacePackages = ["@newcord/shared"];

export default defineConfig({
  main: {
    build: { externalizeDeps: { exclude: bundledWorkspacePackages } },
  },
  preload: {
    build: { externalizeDeps: { exclude: bundledWorkspacePackages } },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react()],
  },
});
