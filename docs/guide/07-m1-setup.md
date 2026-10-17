# M1 setup


These steps create the one repository (D26) with the desktop app, the server and the shared package, and end with both running on your computer. "your-app" is a placeholder for the app's name, "newcord" (D58, D92); the folder names follow a common convention and can be renamed.

## Settings

Proposed by me and accepted by you on October 14, 2026.

| Setting | Proposed | Why |
| --- | --- | --- |
| Node.js version | 26, pinned with `engines.node` in the root `package.json` and a `.node-version` file | It becomes LTS on October 28, 2026 and is supported until April 2029, so the server needs no major upgrade before or soon after M5's deployment; Node 24 enters maintenance on October 20, 2026. The desktop app is unaffected, since Electron bundles its own Node.js. If better-sqlite3 or argon2 has no prebuilt binary for it, stop and report rather than switching versions |
| pnpm version | 11, pinned with `"packageManager": "pnpm@11.5.2"` in the root `package.json`; its settings live in `pnpm-workspace.yaml` | pnpm 11 no longer reads its settings from `.npmrc` ([source](https://pnpm.io/blog/releases/11.0)), and it refuses to install while any package's install script is neither approved nor denied, which enforces the rule to ask before a dependency runs install scripts |

## Repository layout

```
your-app/
├── apps/
│   ├── desktop/        Electron + React client (electron-vite)
│   └── server/         Fastify backend
├── packages/
│   └── shared/         Message schemas and types used by both
├── pnpm-workspace.yaml   Workspace packages, pnpm settings and build approvals
├── eslint.config.js
├── .prettierrc
├── vitest.config.ts
└── LICENSE             AGPL-3.0-or-later (D16, D63)
```

## Steps

1. Install Node.js 26 (see Settings) and pnpm:

```bash
npm install -g pnpm
```

2. Create the repository and the workspace folders:

```bash
mkdir your-app && cd your-app
git init
pnpm init
mkdir -p apps packages/shared
```

3. Tell pnpm where the packages live, in `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

4. Switch pnpm to the hoisted layout that electron-builder needs ([source](https://github.com/codaline-io/electron-builder)), in the same `pnpm-workspace.yaml`. pnpm 11 ignores this setting in `.npmrc` (see Settings):

```yaml
nodeLinker: hoisted
```

5. Create the desktop app from electron-vite's React and TypeScript template ([source](https://evite.netlify.app/guide)):

```bash
cd apps
pnpm create @quick-start/electron desktop --template react-ts --skip
cd ..
```

`--skip` answers the generator's questions with their defaults: no updater plugin (updates are M5, D29), no download mirror and no `.npmrc`. Then pin `electron` to an exact version in `apps/desktop/package.json` (D78): the template's `postinstall` runs `electron-builder install-app-deps`, which refuses a version range under the hoisted layout.

6. Create the server and add Fastify. In `apps/server/package.json`, set `"type": "module"` and a script `"dev": "tsx watch src/index.ts"`:

```bash
mkdir -p apps/server/src
cd apps/server
pnpm init
pnpm add fastify @fastify/websocket
pnpm add -D typescript@~6.0.3 tsx @types/node
cd ../..
```

7. Give the server a minimal entry file, `apps/server/src/index.ts`:

```ts
import Fastify from "fastify";
import websocket from "@fastify/websocket";

const app = Fastify({ logger: true });
await app.register(websocket);

app.get("/health", async () => ({ ok: true }));

await app.listen({ port: 3000 });
```

8. Create the shared package: give `packages/shared/package.json` the name `@your-app/shared`, then link it into both apps. In the desktop app's electron-vite config, make sure this package is bundled rather than treated as an external dependency, since it ships as TypeScript source:

```bash
pnpm --filter desktop --filter server add @your-app/shared --workspace
```

9. Install everything, then choose which packages may run install scripts ([source](https://pnpm.io/cli/approve-builds)). pnpm 11 stops the install until every such package is approved or denied. Approve esbuild by name, deny `electron-winstaller` (D79), and ask before approving anything unfamiliar; the choices are saved under `allowBuilds` in `pnpm-workspace.yaml`. Electron 44 has no install script of its own: the desktop package's own `postinstall` downloads its binary with `install-electron`.

```bash
pnpm install
pnpm approve-builds esbuild
```

10. Add testing (D32) and linting and formatting (D33) at the repository root, then create `vitest.config.ts`, `eslint.config.js` and `.prettierrc`:

```bash
pnpm add -Dw vitest vite
pnpm add -Dw eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-security prettier eslint-config-prettier
```

11. Add the license: put the full AGPL-3.0 text in `LICENSE` and set the `license` field in each `package.json` to "AGPL-3.0-or-later" (D63).
12. Check that both parts run, each in its own terminal. The desktop window should open, and http://localhost:3000/health should answer `{"ok":true}`:

```bash
pnpm --filter desktop dev
pnpm --filter server dev
```

This gives M1 its skeleton. Its features (sign-up, login, the WebSocket hello and the key directory) are in the M1 build steps below.
