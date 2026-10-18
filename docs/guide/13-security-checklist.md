# Security checklist


Every check below belongs to a milestone and must pass before M5's gate. The last table lists the risks you chose to accept, so they get one deliberate review before release.

In #15 the agent proposed, under "Done in", the commit that covers each check, and noted under "Since accepted" what changed for each risk. You review each row: mark it done, or move it to the accepted risks with a reason, and confirm each accepted risk.

## The app

Based on Electron's official security recommendations ([source](https://www.electronjs.org/docs/latest/tutorial/security)).

| Check | When | Done in |
| --- | --- | --- |
| Context isolation and the sandbox on, and Node.js access off, in every window | M1 | `d5ba0fb` (#3) |
| A strict Content Security Policy: only the app's own scripts, no remote code, no eval | M1 | `d5ba0fb` (#3) |
| The preload exposes a few named functions, never ipcRenderer itself; the main process checks the sender and arguments of every call | M1 | `d5ba0fb` (#3) |
| Windows never load remote pages; navigation and new windows are blocked, and links open in the default browser only if they are http or https | M1 | `d5ba0fb` (#3) |
| Chat messages are shown as text, never as HTML, so a message cannot run code | M2 | `994aaee` (#6) |
| Only microphone, screen capture, full screen (D101) and notification permissions are granted; everything else is refused | M3 | `947a906` (#9); `9728e99` (#9) grants screen capture as Electron 44 asks for it |
| A visible "you are sharing" indicator with a stop button whenever the screen is shared | M3 | `1dadb08` (#9) |
| Unused Electron fuses switched off during packaging ([source](https://www.electronjs.org/docs/latest/tutorial/fuses)) | M5 | `6b22c7a` (#13), read back with `@electron/fuses` |
| Electron kept on a supported version, since security fixes arrive through new releases | Ongoing | Ongoing: Electron 44.7.2, pinned in `apps/desktop/package.json`; check before each release |

## The server

| Check | When | Done in |
| --- | --- | --- |
| HTTPS and WSS only: each build has one built-in server address (D65); release builds contain only https and wss addresses, and only development builds may use plain http, to the local machine | M1 | `d5ba0fb` (#3) |
| Every request and envelope validated against its TypeBox schema, with unknown fields rejected | M1 | `a658326`, `876cf91` (#2) |
| A maximum size for WebSocket messages and request bodies | M1 | `a658326` (bodies), `876cf91` (WebSocket messages) (#2); real MLS messages measured in `b9ab6f3` (#5) |
| JWTs verified with HS256 only, any other algorithm rejected; the secret is at least 32 random bytes and never stored in the repository | M1 | `a658326`, `c1e69a9` (#2) |
| Refresh tokens stored only as hashes; reusing an old one cancels all of that device's tokens | M1 | `a658326`, `c1e69a9` (#2) |
| Token comparisons use a constant-time check | M1 | `a658326`, `c1e69a9` (#2): passwords and Recovery codes through `argon2` 0.45.1, access tokens through `fast-jwt` 6.3.4, both comparing with `timingSafeEqual`; refresh tokens are found by their SHA-256 hash, which reveals nothing usable about the token |
| Rate limits on login, sign-up, refresh, password change and recovery, key-directory lookups, key-package requests and invitations | M1, M2 | `a658326`, `c1e69a9`, `ea38d2d`, `876cf91` (#2); `e45c240`, `f61c597` (#5) |
| Logs never contain passwords, tokens or message payloads | M1 | `a658326` (#2) |
| The server and coturn run as non-root users with only the permissions they need | M3 | Configured in `7ce5b28` (#14); confirmed on the machine in #14 Step 03 |
| Database backups protected like the database itself: they hold usernames, password hashes, group names and metadata | M5 | Script in `7ce5b28` (#14); the private bucket is #14 Step 04 |

## Encryption

| Check | When | Done in |
| --- | --- | --- |
| The MLS state saved before anything is sent (D39) | M2 | `3890a6b` (#6) |
| SQLite's secure\_delete on in the app's database, so deleted keys are erased | M2 | `e61f76e` (#3) |
| The AES implementation inside WebAssembly confirmed constant-time (D38). Confirmed in #4: on `wasm32-unknown-unknown`, `aes` 0.8.4 (through `aes-gcm` 0.10.3 in `openmls_rust_crypto` 0.6.0) has no CPU intrinsics to use and compiles only its portable "soft" backend, which its documentation describes as "a constant-time pure Rust implementation based on fixslicing … with no use of any lookup tables or data-dependent branches"; GCM's GHASH uses `polyval` 0.6.2, whose soft backend is likewise documented as constant-time | M2 | `dd9e469` (#4) |
| Every commit checked against its declared change and the 10-person limit, with a notice naming the sender when it fails (D41, D71) | M2 | `ccce9ff` (#5, server), `1f613a2` (#6, app) |
| Call setup accepted only as MLS-encrypted messages, never in plain form (D18) | M3 | `56f4e4d` (#9) |
| Safety numbers in the interface, so members can verify each other's keys (D7) | M4 | `2512c97`, `7c69ce3` (#11) |

## Calls and relay

| Check | When | Done in |
| --- | --- | --- |
| coturn refuses to relay into private networks and accepts only short-lived passwords | M3 | `ff9ab62`, `a7dadbd` (#8); production configuration in `7ce5b28` (#14) |
| Hide my IP confirmed: the selected connection uses the relay | M3 | `43bbd3a` (#9); the getStats() confirmation is #9 Step 02's hands-on check |
| Notification previews hidden while screen sharing (D15) | M4 | `5560dce` (#10) |

## Dependencies and releases

| Check | When | Done in |
| --- | --- | --- |
| Only known packages approved to run install scripts (D31) | M1 | `bc366d1` (#1); `0bcc890` (#9) for `uiohook-napi` (D93) |
| The lockfile committed, and builds installed with pnpm install --frozen-lockfile | M1 | `bc366d1` (#1); frozen installs in `da18105` (#13, releases) and `924a813` (D99, checks) |
| pnpm audit run before every release. Run in #15 on October 17, 2026: no high or critical findings, and one moderate one that does not apply: `sprintf-js` 1.1.3 ([GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), a denial of service through unbounded precision specifiers) is reached only through `electron-builder` → `@electron/get` → `global-agent` → `roarr` while packaging, is not inside the packaged app, and is given only `roarr`'s own log formats; npm had no patched version (1.1.4) published | M5 | `eef5ed1` (#15) |
| The release account protected with two-factor authentication, ideally a hardware key, because nothing else stops a fake update (D29b) | M5 | Yours to confirm: a hardware key on the GitHub account. Since October 17, 2026, rulesets also require passing pull requests on `main`, let only admins create `v*` tags, and stop anyone moving or deleting them (GitHub settings, no commit) |
| Releases built on a clean machine or in CI, never on a development laptop | M5 | `da18105` (#13) |

## Risks you accepted

| Risk | From | What it means | What could still reduce it | Since accepted |
| --- | --- | --- | --- | --- |
| Unencrypted local storage | D20 | Anyone who copies the app's database from a running or unlocked computer can read its history and impersonate the user until their keys change | Encrypting just the keys with Electron's safeStorage, or the whole database; full-disk encryption | Unchanged; the installed app's data now lives in `%APPDATA%\newcord` (D95) |
| Updates without any signature | D29, D29b | Whoever controls the release account can push an update to every user | Your own signature check (D29b, option A) | Reduced: releases start as drafts you check before publishing (D96), and rulesets let only admins create `v*` tags and nobody move or delete them; the hardware key is still to add |
| Unsigned installers | D29 | Windows warns of an unknown publisher, and users cannot tell your installer from a fake | Publishing checksums on a page you control; paid signing later | Reduced a little: each release's notes list every file's SHA-256 (#13); Windows is the only platform (D73), so SmartScreen's warning is what users see |
| Group names visible to the server | D40 | The server, and anyone who breaches it, can read every group's name | Encrypting names (D40, option A) | Unchanged |
| Metadata on the server | D1 | The server sees who talks to whom, when and how much | Inherent to the hybrid design; keep logs minimal and short-lived | Unchanged; the heartbeat (D100) adds no new data |
| IP addresses visible in calls by default | D14 | Call members learn each other's IP addresses unless they turn on Hide my IP | Making Hide my IP the default | Unchanged |
| H.264 patents | D11 | Distributing an H.264 encoder may fall under patent pool terms | Checking the current terms before release | Unchanged; the terms still need checking before `v0.1.0` |
| Review by the author only | D51 | Nobody outside checks the encryption or server code before release | A public beta (D51, option B) or a paid audit later | Unchanged; automatic checks on every pull request (D99) catch regressions but are not a review |
| New devices join groups automatically | D56 | Anyone who steals a password can log in a device that is added to all of that person's groups and reads new messages | Approval from an existing device (D56, option B); members checking the new-device notice | Unchanged |
| Rule-breaking commits are applied | D71 | A device added without being declared, through a dishonest member's app and a server that lets it pass, reads new messages until someone removes it; members only see a notice | Freezing the group instead (D71, option A) | Unchanged |
| Recovery code and logged-in password resets | D55 | Anyone holding the recovery code, or using an unlocked logged-in computer, can set a new password and take over the account | Keeping the code offline; a new code after every use; protecting the computer itself | Unchanged |
| A deployment key in GitHub | D105 | Whoever controls the repository's production environment can make the machine install any published release, though the key can run nothing but `newcord-update <version>` and every deployment waits for your approval | Updating by hand over SSH instead (D105, option B); a hardware key on the GitHub account | New in D105 |
