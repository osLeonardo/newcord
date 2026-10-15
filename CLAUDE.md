# CLAUDE.md

## Project

A small, security-focused Discord alternative. There are no Discord-style servers (guilds): only flat group chats of up to 10 people, each with one drop-in call for up to about 6 people (voice and screen sharing, peer-to-peer mesh). Desktop first, Windows and Linux. License: AGPL-3.0-or-later.

Status: the design is complete (decisions D1 to D68, all made by the user). Nothing is built yet. Implementation starts at milestone M1.

The full design lives in `docs/guide/`. `docs/README.md` explains which file to read for what.

## How to work with the user (must follow)

- The user makes every decision. Never choose an architecture, library, protocol, product behavior, security trade-off or default value on your own.
- When a decision is needed, present at least two options with pros and cons, your recommendation and why, then wait for the user's answer.
- Record each new decision in `docs/guide/03-decisions.md` using the next number (D69, D70, …) and the same format (context, options table, recommendation, `Your choice: … (decided YYYY-MM-DD)`), and add a row to the summary table at the top of that file.
- The decision log replaces ADRs in this repository: there is no `docs/adr/`. When a workspace skill offers to create an ADR, record a D-entry in `03-decisions.md` instead. The domain glossary is `CONTEXT.md` at the repository root.
- Values the guide marks as "Settings" were proposed and accepted; use them as written. If a step needs a value the guide does not give, ask.
- Internal implementation details inside a decided design (function names, file layout inside a package, test structure) do not need a decision.
- If the guide turns out to be wrong, incomplete or contradictory, or a library behaves differently than the guide says, stop and tell the user with options. Never silently diverge from the guide.
- Communicate in English unless the user explicitly asks for another language. Code, comments, commit messages and docs are in English.

## Before writing any code

1. **Use the working title "newcord" (D58).** The final name is chosen before M5 starts. Until then, "newcord" replaces every placeholder in the guide: `your-app`, `yourapp`, `Your App`, `@your-app/shared`, `com.yourapp.desktop`, `your-app.example`, `yourapp.duckdns.org` and `yourapp-turn.duckdns.org`.
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
- Desktop: Electron, built with electron-vite and packaged with electron-builder; React interface; TypeScript.
- Server: TypeScript on Node.js, Fastify with `@fastify/websocket`, SQLite through better-sqlite3, Argon2id password hashes, JWT (HS256, 15 minutes) plus refresh tokens stored as hashes.
- Shared schemas: TypeBox (package `typebox`), validating both HTTP requests and WebSocket envelopes. Wire format: JSON, encrypted payloads in base64.
- Encryption: MLS (RFC 9420) through OpenMLS compiled to WebAssembly with wasm-bindgen, cipher suite 1 (X25519, AES-128-GCM, SHA-256, Ed25519). The MLS state is saved as one blob after every change.
- Calls: WebRTC mesh in the main window, Opus voice, screen sharing with VP8, VP9 or H.264 (H.264 by default, chosen in settings), coturn relay with short-lived credentials, a "Hide my IP" setting.
- Testing: Vitest, plus Rust tests for the MLS crate. Linting and formatting: ESLint (with React hooks and security plugins) and Prettier.
- Releases: GitHub Actions to GitHub Releases; installers are NSIS per-user on Windows, plus AppImage, .deb, .rpm and pacman on Linux; unsigned automatic updates through electron-updater.
- Production: one Oracle Cloud Always Free Arm machine, nginx routing port 443 by hostname, two DuckDNS names, Let's Encrypt certificates.

## Commands

The repository does not exist yet; M1 setup creates it. Once it does:

- `pnpm install`, then `pnpm approve-builds` after adding packages that run install scripts
- `pnpm --filter desktop dev` runs the desktop app
- `pnpm --filter server dev` runs the server (http://localhost:3000/health should answer `{"ok":true}`)
- M1 setup installs Vitest, ESLint and Prettier but does not define scripts for them: add root `test`, `lint` and `format` scripts then, and keep this section up to date with the real commands.

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
- Every member's app checks each commit against the change its sender declared, and rejects groups larger than 10 people (D41, D17).

**Dependencies**
- Ask before adding a dependency that runs install scripts, a native module, or any new third-party network service.
- Commit the lockfile, and install with `pnpm install --frozen-lockfile` in CI. There is no CI before M5's release workflow (D68): run the tests, lint and typecheck locally before each PR is merged.

**Accepted risks**
- `13-security-checklist.md` lists the risks the user chose to accept, such as unencrypted local storage (D20) and new devices joining groups automatically (D56). Do not "fix" them on your own; you may suggest a change, as a decision with options.

## Milestones

| Milestone | Steps | Status |
| --- | --- | --- |
| M1 · Backend and accounts | `07-m1-setup.md`, `08-m1-build.md` | Not started |
| M2 · Encrypted group chat | `09-m2-build.md` | Not started |
| M3 · Calls | `10-m3-build.md` | Not started |
| M4 · Desktop polish | `11-m4-build.md` | Not started |
| M5 · Security review and release, plus server deployment | `12-m5-build.md`, `14-server-deployment.md` | Not started |

- Each milestone's "Tests" and "Done when" sections are its acceptance criteria. A milestone is finished only when its "Done when" check passes; then update this table.
- Work in small steps, write tests alongside the code, and commit after each working step.
- Work follows the workspace flow (`{root}/.claude/docs/knowledge/development-process.md`): each milestone is a GitHub Milestone, each piece of a build guide is a GitHub Issue, and each issue is built on its own `feature/<issue>-<slug>` branch and merged into `main` through a Pull Request. The commits after each working step happen on that branch.

## Known pending items

- Before M5 starts: choose the app's final name and replace "newcord" everywhere (D58).
- When M2 planning starts: removing a lost or stolen device, both from the account and from every group's MLS membership. Nothing in the guide does this yet; cancelling its tokens (D66) only stops the server delivering to it.
- When M3 starts: choose the Windows keyboard-hook library for global push-to-talk (D44b), as a decision with options.
- Out of scope for version 1, so do not build them: webcam video, phone apps, macOS, editing or deleting messages, reactions, typing indicators, file sharing and deleting an account (D67).
