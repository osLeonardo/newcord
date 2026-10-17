# CLAUDE.md

## Project

A small, security-focused Discord alternative. There are no Discord-style servers (guilds): only flat group chats of up to 10 people, each with one drop-in call for up to about 6 people (voice and screen sharing, peer-to-peer mesh). Desktop first, Windows only in version 1 (D73). License: AGPL-3.0-or-later.

Status: the design is complete (decisions D1 to D82, all made by the user). Milestone M1 is in progress: the repository scaffold (#1) is built.

The full design lives in `docs/guide/`. `docs/README.md` explains which file to read for what.

## How to work with the user (must follow)

- The user makes every decision. Never choose an architecture, library, protocol, product behavior, security trade-off or default value on your own.
- When a decision is needed, present at least two options with pros and cons, your recommendation and why, then wait for the user's answer.
- Record each new decision in `docs/guide/03-decisions.md` using the next number (D75, D76, …) and the same format (context, options table, recommendation, `Your choice: … (decided YYYY-MM-DD)`), and add a row to the summary table at the top of that file.
- The decision log replaces ADRs in this repository: there is no `docs/adr/`. When a workspace skill offers to create an ADR, record a D-entry in `03-decisions.md` instead. The domain glossary is `CONTEXT.md` at the repository root.
- Values the guide marks as "Settings" were proposed and accepted; use them as written. If a step needs a value the guide does not give, ask.
- Internal implementation details inside a decided design (function names, file layout inside a package, test structure) do not need a decision.
- If the guide turns out to be wrong, incomplete or contradictory, or a library behaves differently than the guide says, stop and tell the user with options. Never silently diverge from the guide.
- Communicate in English unless the user explicitly asks for another language. Code, comments, commit messages and docs are in English.

## Before writing any code

1. **The app is named "newcord" (D58, D92).** "newcord" replaces every placeholder in the guide: `your-app`, `yourapp`, `Your App`, `@your-app/shared`, `com.yourapp.desktop`, `your-app.example`, `yourapp.duckdns.org` and `yourapp-turn.duckdns.org`.
2. This folder is the repository root. In M1 setup step 2, do not create a new folder: run `git init` here if it is not a repository yet, and create `apps/` and `packages/shared` here.
3. Then follow `docs/guide/07-m1-setup.md` step by step, followed by `docs/guide/08-m1-build.md`.

## Where to look

| Need | File |
| --- | --- |
| Why something is the way it is | `docs/guide/03-decisions.md`: read the summary table at the top, then search for the decision's number (for example `## D37b`). Decisions are not strictly in numeric order (D22 comes before D21; D4b sits after D29b) |
| How the parts fit together | `docs/guide/04-architecture.md` |
| Milestones and their gates | `docs/guide/05-milestones.md` |
| Every envelope and payload type | `docs/guide/06-message-formats.md` |
| Step-by-step work for the current milestone | `docs/guide/07-m1-setup.md`, then `08` to `12` for M1 to M5 |
| Security rules and accepted risks | `docs/guide/13-security-checklist.md` |
| Production server | `docs/guide/14-server-deployment.md` |

Read only the files the current task needs; `03-decisions.md` is large.

## Stack (decided)

- Monorepo with pnpm workspaces: `apps/desktop`, `apps/server`, `packages/shared`; later `packages/mls` (Rust).
- Desktop: Electron, built with electron-vite and packaged with electron-builder; React interface styled with Tailwind CSS (D69); TypeScript.
- Server: TypeScript on Node.js, Fastify with `@fastify/websocket`, SQLite through better-sqlite3, Argon2id password hashes, JWT (HS256, 15 minutes) plus refresh tokens stored as hashes.
- Shared schemas: TypeBox (package `typebox`), validating both HTTP requests and WebSocket envelopes. Wire format: JSON, encrypted payloads in base64.
- Encryption: MLS (RFC 9420) through OpenMLS compiled to WebAssembly with wasm-bindgen, cipher suite 1 (X25519, AES-128-GCM, SHA-256, Ed25519). The MLS state is saved as one blob after every change.
- Calls: WebRTC mesh in the main window, Opus voice, screen sharing with VP8, VP9 or H.264 (H.264 by default, chosen in settings), coturn relay with short-lived credentials, a "Hide my IP" setting.
- Testing: Vitest, plus Rust tests for the MLS crate. Linting and formatting: ESLint (with React hooks and security plugins) and Prettier.
- Releases: GitHub Actions to GitHub Releases; installers are NSIS per-user on Windows (Linux packages are out of version 1, D73); unsigned automatic updates through electron-updater.
- Production: one Oracle Cloud Always Free Arm machine, nginx routing port 443 by hostname, two DuckDNS names, Let's Encrypt certificates.

## Commands

Run every command from the repository root:

- `pnpm install` installs all packages; after adding a package that runs install scripts, run `pnpm approve-builds <package>`. pnpm 11 stops the install until each one is approved or denied, and its settings live in `pnpm-workspace.yaml`, not `.npmrc`
- `pnpm --filter desktop dev` runs the desktop app in development mode (electron-vite with hot reload) and opens its window
- `pnpm --filter server dev` runs the server in watch mode (http://localhost:3000/health should answer `{"ok":true}`). It reads `apps/server/.env` with Node's `--env-file-if-exists`: copy `apps/server/.env.example` to `apps/server/.env` (ignored by git) and set `JWT_SECRET` to the output of `openssl rand -base64 48`, because the server refuses to start without a secret of at least 32 bytes. Set `RELAY_SECRET` the same way (the secret shared with coturn, #8) and `RELAY_URLS` to the relay's `stun:`/`turn:` addresses separated by commas; the server refuses to start without them too. `DATABASE_PATH` names the SQLite file, `newcord.db` by default. In production only, `LISTEN_HOST=127.0.0.1` and `TRUST_PROXY=127.0.0.1` keep the server behind nginx (`deploy/`, #14)
- `pnpm --filter server start` runs the server as production does, through tsx without watching (D89); systemd sets its settings from `/etc/newcord/env` (`deploy/`)
- `pnpm --filter @newcord/mls build` builds the MLS module (#4): the crate for `wasm32-unknown-unknown`, then wasm-bindgen's Node.js module in `packages/mls/pkg/` (not committed). It needs Rust's GNU toolchain (`stable-x86_64-pc-windows-gnu`) with the `wasm32-unknown-unknown` target, and `wasm-bindgen` plus `wasm-bindgen-test-runner` 0.2.129 from wasm-bindgen's GitHub release, all on PATH (`%USERPROFILE%\.cargo\bin`, D94); `pnpm --filter @newcord/mls test:rust` runs the crate's Rust tests as WebAssembly in Node
- `pnpm test` builds the MLS module, runs its Rust tests, then every package's tests once with Vitest; `pnpm exec vitest --project server` runs one package's tests in watch mode
- `pnpm lint` runs ESLint over the whole repository with type-aware rules and explicit return types, and any warning fails it (D77)
- `pnpm format` rewrites code and configuration files with Prettier (Markdown and the lockfile are excluded in `.prettierignore`)
- `pnpm typecheck` runs each package's `typecheck` script (`tsc --noEmit`)
- Before each PR (no CI before M5, D68): `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm format` leaving no changes

Tooling configuration lives only at the root: `vitest.config.ts` (one entry in `test.projects` per package, tests in each package's `test/` folder), `eslint.config.js` and `.prettierrc`. A package adds only a `typecheck` script and its TypeScript configuration: `apps/server` and `packages/shared` have a `tsconfig.json` extending `tsconfig.base.json`; `apps/desktop` keeps the electron-vite template's `tsconfig.node.json` (main process, preload, build config and tests) and `tsconfig.web.json` (renderer), which extend `@electron-toolkit/tsconfig`. `apps/desktop/electron.vite.config.ts` bundles `@newcord/shared` into the main and preload builds, since the package ships TypeScript source. Keep this section up to date with the real commands.

## Rules that are never broken

These come from the decisions and the security checklist (`13-security-checklist.md`).

**Desktop app**
- Every window keeps context isolation and the sandbox on, and Node.js access off.
- A strict Content Security Policy: only the app's own scripts, no remote code, no `eval`.
- The preload exposes a few named functions, never `ipcRenderer` itself. The main process checks the sender and the arguments of every IPC call.
- Windows never load remote pages. Navigation and new windows are blocked, and links open in the default browser only if they are http or https.
- Keys, tokens, the MLS state, the OpenMLS module and all network calls live only in the main process.
- Chat messages are rendered as text, never as HTML.
- The MLS state is saved before anything is sent to the server, and the local database has SQLite's `secure_delete` on.

**Server**
- Every request and envelope is validated against its TypeBox schema, with unknown fields rejected, and has a size limit.
- JWTs are verified with HS256 only. Secrets come from the environment and are never committed.
- Refresh tokens and recovery codes are stored only as hashes and compared in constant time.
- Login, sign-up, refresh, password recovery, key-package requests and invitations are rate-limited.
- Logs never contain passwords, tokens, recovery codes or message payloads.

**Protocol**
- Anything members should read goes inside the MLS payload. Envelopes carry only what the server needs to route, order and delete.
- Call setup (offers, answers, candidates, fingerprints) travels only as MLS-encrypted messages (D18).
- Every member's app checks each commit against the change its sender declared and against the 10-person limit; a commit that fails is still applied, and the app shows a notice naming the sender and what the commit really did (D41, D17, D71).

**Dependencies**
- Ask before adding a dependency that runs install scripts, a native module, or any new third-party network service.
- Commit the lockfile, and install with `pnpm install --frozen-lockfile` in CI. There is no CI before M5's release workflow (D68): run the tests, lint and typecheck locally before each PR is merged.

**Accepted risks**
- `13-security-checklist.md` lists the risks the user chose to accept, such as unencrypted local storage (D20) and new devices joining groups automatically (D56). Do not "fix" them on your own; you may suggest a change, as a decision with options.

## Milestones

| Milestone | Steps | Status |
| --- | --- | --- |
| M1 · Backend and accounts | `07-m1-setup.md`, `08-m1-build.md` | In progress |
| M2 · Encrypted group chat | `09-m2-build.md` | Not started |
| M3 · Calls | `10-m3-build.md` | Not started |
| M4 · Desktop polish | `11-m4-build.md` | Not started |
| M5 · Security review and release, plus server deployment | `12-m5-build.md`, `14-server-deployment.md` | Not started |

- Each milestone's "Tests" and "Done when" sections are its acceptance criteria. A milestone is finished only when its "Done when" check passes; then update this table.
- Work in small steps, write tests alongside the code, and commit after each working step.
- Work follows the workspace flow (`{root}/.claude/docs/knowledge/development-process.md`): each milestone is a GitHub Milestone, each piece of a build guide is a GitHub Issue, and each issue is built on its own `feature/<issue>-<slug>` branch and merged into `main` through a Pull Request. The commits after each working step happen on that branch.

## Known pending items

- Out of scope for version 1, so do not build them: webcam video, phone apps, macOS, editing or deleting messages, reactions, typing indicators, file sharing, deleting an account (D67) and removing a single lost device (D72), and Linux desktop builds (D73).
