# newcord

A small, security-focused chat and call app for groups of friends. There are no servers or channels: only flat groups of up to 10 people, each with an end-to-end encrypted chat and one drop-in call for up to about 6 people, with voice and screen sharing.

- **Encrypted end to end** with MLS (RFC 9420): the server routes messages but cannot read them.
- **Calls connect directly** between people (peer-to-peer). A relay steps in when a network blocks that, and **Hide my IP** always uses it.
- **Windows only** in version 1.

## Install the desktop app

You need Windows 10 or 11, 64-bit.

1. Open the [latest release](https://github.com/osLeonardo/newcord/releases/latest) and download **`newcord-<version>-setup.exe`**.
2. Optional but recommended: check the download is intact. In PowerShell, in your Downloads folder, compare the hash this prints with the `SHA-256` list in the release notes:

   ```powershell
   Get-FileHash .\newcord-0.1.1-setup.exe -Algorithm SHA256
   ```

3. Run it. The installer is not signed yet, so Windows shows **"Windows protected your PC"**: click **More info → Run anyway**. It installs for your Windows user only, with no administrator prompt, adds a desktop and Start menu shortcut, and opens the app.

### First steps

1. **Sign up** with a username (3 to 32 lowercase letters, digits or `_`) and a password of at least 12 characters.
2. **Write down your Recovery code.** It is shown once, and it is the only way back into your account if you forget your password.
3. **Create a group** and **invite** your friends by username. They accept the invitation in their own app.
4. **Join the call** from the group's header. **Share screen** asks what to share and whether it is mostly text and code (kept sharp) or video and games (kept smooth). Viewers can watch a share **full screen** with the button below it, or by double-clicking it.

The app starts with Windows, hidden in the tray, so messages reach you; turn that off in **Settings → App**. Closing the window keeps it running in the tray, unless you choose to quit on close.

**Settings** also holds your microphone mode (voice activity or push-to-talk, and its key), the mute hotkey (`Ctrl+Shift+M` while in a call), the screen-share codec, **Hide my IP**, and notification previews.

**Safety numbers**: in a group's member list, compare a person's safety number with them face to face or on another channel, then mark them as verified. The app warns you if it changes.

### Updates

The app checks for a new version when it starts and every 6 hours, downloads it in the background, and installs it the next time it restarts. It never restarts during a call: when an update is ready, a **Restart to update** banner appears.

### Uninstall

**Windows Settings → Apps → Installed apps → newcord → Uninstall.** Your local data (messages and keys) stays in `%APPDATA%\newcord`; delete that folder too to erase it.

### Good to know

- Your messages, keys and settings are stored on your computer **unencrypted** (decision D20): protect your Windows account and disk.
- Logging in on a new computer adds it to your groups automatically, and your friends see a notice (D56).
- The server learns who talks to whom and when, but not what is said. The full list of security checks and the risks accepted on purpose is in [`docs/guide/13-security-checklist.md`](docs/guide/13-security-checklist.md).

## Run the server

The server runs on one Oracle Cloud Always Free machine, behind two DuckDNS names. [`deploy/MANUAL.md`](deploy/MANUAL.md) walks through it step by step, from creating the machine to one-click updates from GitHub.

## Develop

The repository is a pnpm monorepo:

- `apps/desktop` is the Electron app;
- `apps/server` is the Fastify server;
- `packages/shared` holds the schemas both use;
- `packages/mls` is the Rust MLS module, compiled to WebAssembly.

You need Node.js 26, pnpm 11.5.2, and Rust's GNU toolchain with the `wasm32-unknown-unknown` target and `wasm-bindgen` 0.2.129. Then:

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # then fill in the secrets it describes
pnpm --filter server dev                       # http://localhost:3000/health
pnpm --filter desktop dev                      # the app, against the local server
pnpm --filter desktop dev:second               # a second copy, for a second account
pnpm test && pnpm lint && pnpm typecheck
```

[`CLAUDE.md`](CLAUDE.md) lists every command and the rules the code follows. The design, with every decision and its reasoning, is in [`docs/`](docs/README.md).

## License

[AGPL-3.0-or-later](LICENSE).
