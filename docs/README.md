# Development guide

The design for this project, written before any code. Every decision was made by the project owner from at least two options; the reasoning for each is in `guide/03-decisions.md`.

The original lives as a Claude Doc, exported on 2026-10-14. From now on, this copy in the repository is the one to keep up to date.

| File | What it covers |
| --- | --- |
| `guide/01-requirements.md` | The goals and how each was settled |
| `guide/02-discord-analysis.md` | How Discord works, what changes peer-to-peer, similar projects worth studying |
| `guide/03-decisions.md` | Decisions D1 to D74: a summary table, then each decision with its options, pros and cons, recommendation and final choice |
| `guide/04-architecture.md` | The client, the backend and the relay, and how messages and calls flow |
| `guide/05-milestones.md` | The five milestones and the test that closes each |
| `guide/06-message-formats.md` | Account requests, WebSocket envelopes and encrypted payloads |
| `guide/07-m1-setup.md` | Creating the repository and running the app and server for the first time |
| `guide/08-m1-build.md` | M1: accounts, login, tokens, password recovery, WebSocket and key directory |
| `guide/09-m2-build.md` | M2: OpenMLS as WebAssembly, groups, invitations, the message queue, new devices, leaving and blocking |
| `guide/10-m3-build.md` | M3: voice, screen sharing, the coturn relay and Hide my IP |
| `guide/11-m4-build.md` | M4: tray, start at login, notifications, the settings screen and safety numbers |
| `guide/12-m5-build.md` | M5: security review, packaging, automatic updates and releases |
| `guide/13-security-checklist.md` | Every security check by milestone, and the risks accepted on purpose |
| `guide/14-server-deployment.md` | Running the backend and relay on Oracle Cloud Always Free with DuckDNS |

Placeholders such as `your-app` and `yourapp.duckdns.org` stand for the app's name. Until M5 the working title "newcord" fills them; the final name is chosen before M5 starts (D58).
