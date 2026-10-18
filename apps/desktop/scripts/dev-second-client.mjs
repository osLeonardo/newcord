// Opens a second development copy of the app, for a second Account on this computer (D95). It
// keeps its data in %APPDATA%\newcord-dev-2 and loads the page from the dev server that
// `pnpm --filter desktop dev` is already running, so start that first.
import { spawn } from "node:child_process";
import process from "node:process";
import electron from "electron";

const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEWCORD_DEV_PROFILE: process.env.NEWCORD_DEV_PROFILE ?? "2",
    ELECTRON_RENDERER_URL:
      process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5173/",
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
