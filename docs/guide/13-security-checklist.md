# Security checklist


Every check below belongs to a milestone and must pass before M5's gate. The last table lists the risks you chose to accept, so they get one deliberate review before release.

## The app

Based on Electron's official security recommendations ([source](https://www.electronjs.org/docs/latest/tutorial/security)).

| Check | When |
| --- | --- |
| Context isolation and the sandbox on, and Node.js access off, in every window | M1 |
| A strict Content Security Policy: only the app's own scripts, no remote code, no eval | M1 |
| The preload exposes a few named functions, never ipcRenderer itself; the main process checks the sender and arguments of every call | M1 |
| Windows never load remote pages; navigation and new windows are blocked, and links open in the default browser only if they are http or https | M1 |
| Chat messages are shown as text, never as HTML, so a message cannot run code | M2 |
| Only microphone, screen capture and notification permissions are granted; everything else is refused | M3 |
| A visible "you are sharing" indicator with a stop button whenever the screen is shared | M3 |
| Unused Electron fuses switched off during packaging ([source](https://www.electronjs.org/docs/latest/tutorial/fuses)) | M5 |
| Electron kept on a supported version, since security fixes arrive through new releases | Ongoing |

## The server

| Check | When |
| --- | --- |
| HTTPS and WSS only: each build has one built-in server address (D65); release builds contain only https and wss addresses, and only development builds may use plain http, to the local machine | M1 |
| Every request and envelope validated against its TypeBox schema, with unknown fields rejected | M1 |
| A maximum size for WebSocket messages and request bodies | M1 |
| JWTs verified with HS256 only, any other algorithm rejected; the secret is at least 32 random bytes and never stored in the repository | M1 |
| Refresh tokens stored only as hashes; reusing an old one cancels all of that device's tokens | M1 |
| Token comparisons use a constant-time check | M1 |
| Rate limits on login, sign-up, refresh, password change and recovery, key-directory lookups, key-package requests and invitations | M1, M2 |
| Logs never contain passwords, tokens or message payloads | M1 |
| The server and coturn run as non-root users with only the permissions they need | M3 |
| Database backups protected like the database itself: they hold usernames, password hashes, group names and metadata | M5 |

## Encryption

| Check | When |
| --- | --- |
| The MLS state saved before anything is sent (D39) | M2 |
| SQLite's secure\_delete on in the app's database, so deleted keys are erased | M2 |
| The AES implementation inside WebAssembly confirmed constant-time (D38) | M2 |
| Every commit checked against its declared change and the 10-person limit, with a notice naming the sender when it fails (D41, D71) | M2 |
| Call setup accepted only as MLS-encrypted messages, never in plain form (D18) | M3 |
| Safety numbers in the interface, so members can verify each other's keys (D7) | M4 |

## Calls and relay

| Check | When |
| --- | --- |
| coturn refuses to relay into private networks and accepts only short-lived passwords | M3 |
| Hide my IP confirmed: the selected connection uses the relay | M3 |
| Notification previews hidden while screen sharing (D15) | M4 |

## Dependencies and releases

| Check | When |
| --- | --- |
| Only known packages approved to run install scripts (D31) | M1 |
| The lockfile committed, and builds installed with pnpm install --frozen-lockfile | M1 |
| pnpm audit run before every release | M5 |
| The release account protected with two-factor authentication, ideally a hardware key, because nothing else stops a fake update (D29b) | M5 |
| Releases built on a clean machine or in CI, never on a development laptop | M5 |

## Risks you accepted

| Risk | From | What it means | What could still reduce it |
| --- | --- | --- | --- |
| Unencrypted local storage | D20 | Anyone who copies the app's database from a running or unlocked computer can read its history and impersonate the user until their keys change | Encrypting just the keys with Electron's safeStorage, or the whole database; full-disk encryption |
| Updates without any signature | D29, D29b | Whoever controls the release account can push an update to every user | Your own signature check (D29b, option A) |
| Unsigned installers | D29 | Windows warns of an unknown publisher, and users cannot tell your installer from a fake | Publishing checksums on a page you control; paid signing later |
| Group names visible to the server | D40 | The server, and anyone who breaches it, can read every group's name | Encrypting names (D40, option A) |
| Metadata on the server | D1 | The server sees who talks to whom, when and how much | Inherent to the hybrid design; keep logs minimal and short-lived |
| IP addresses visible in calls by default | D14 | Call members learn each other's IP addresses unless they turn on Hide my IP | Making Hide my IP the default |
| H.264 patents | D11 | Distributing an H.264 encoder may fall under patent pool terms | Checking the current terms before release |
| Review by the author only | D51 | Nobody outside checks the encryption or server code before release | A public beta (D51, option B) or a paid audit later |
| New devices join groups automatically | D56 | Anyone who steals a password can log in a device that is added to all of that person's groups and reads new messages | Approval from an existing device (D56, option B); members checking the new-device notice |
| Rule-breaking commits are applied | D71 | A device added without being declared, through a dishonest member's app and a server that lets it pass, reads new messages until someone removes it; members only see a notice | Freezing the group instead (D71, option A) |
| Recovery code and logged-in password resets | D55 | Anyone holding the recovery code, or using an unlocked logged-in computer, can set a new password and take over the account | Keeping the code offline; a new code after every use; protecting the computer itself |
