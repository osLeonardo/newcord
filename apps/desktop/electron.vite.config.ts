import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "electron-vite";
import type { ConfigEnv } from "vite";
import { contentSecurityPolicyPlugin } from "./src/build-config/content-security-policy";
import {
  builtInServerAddresses,
  checkServerAddress,
  serverAddressForMode,
  type ServerAddressesByBuild,
} from "./src/build-config/server-address";

// @newcord/shared ships TypeScript source, so it cannot be loaded at run time.
const bundledWorkspacePackages = ["@newcord/shared"];

/**
 * The electron-vite configuration of one build; throws, failing the build, when its server address breaks D65.
 * @example createDesktopBuildConfig({ command: "build", mode: "production" })
 */
export function createDesktopBuildConfig(
  env: ConfigEnv,
  serverAddresses: ServerAddressesByBuild = builtInServerAddresses,
): UserConfig {
  const serverAddress = checkServerAddress(
    serverAddressForMode(env.mode, serverAddresses),
  );
  return {
    main: {
      build: { externalizeDeps: { exclude: bundledWorkspacePackages } },
      define: { BUILT_IN_SERVER_ADDRESS: JSON.stringify(serverAddress) },
    },
    preload: {
      build: { externalizeDeps: { exclude: bundledWorkspacePackages } },
    },
    renderer: {
      resolve: { alias: { "@renderer": resolve("src/renderer/src") } },
      plugins: [
        react(),
        tailwindcss(),
        contentSecurityPolicyPlugin(env.command),
      ],
    },
  };
}

export default defineConfig((env) => createDesktopBuildConfig(env));
