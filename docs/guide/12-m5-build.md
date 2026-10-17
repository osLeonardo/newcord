# M5 build steps


M5 takes the app to release: your security review, hardened packaging, automatic updates, and builds on GitHub Actions published to GitHub Releases. M5 is done when every check in the Security checklist passes and the installer runs on a clean Windows machine. Deploying the server comes after D52 is settled.

The app's name is "newcord" (D92): the `appId` is `com.newcord.desktop`, and the DuckDNS names are `newcord.duckdns.org` and `newcord-turn.duckdns.org`.

## Settings

Proposed by me and accepted by you on October 14, 2026.

| Setting | Proposed | Why |
| --- | --- | --- |
| Version numbers | Semantic versioning, starting at 0.1.0 | The updater compares versions, and 0.x signals an early release |
| Update checks | At startup and every 6 hours; download in the background and install on the next restart, never during a call | Fixes reach people quickly without interrupting them |
| Release trigger | Pushing a version tag such as v0.1.0 | Nothing ships by accident |
| Windows installer | NSIS, installed per user | Per-user installs update without an administrator prompt ([source](https://github.com/electron-userland/electron-builder/releases/tag/electron-updater@7.0.0-alpha.5)) |
| Checksums | SHA-256 of every installer listed in the release notes | Partly makes up for unsigned installers (Risks you accepted) |

## Security review (D51)

1. Go through every check in the Security checklist and mark it done, noting the commit that covers it.
2. Run the automated checks: `pnpm audit`, ESLint with its security plugin (D33), and Electron's own security warnings, which it prints to the developer console ([source](https://electronjs.org/docs/tutorial/security)).
3. Re-read Risks you accepted and confirm each one is still acceptable.

## Packaging

4. Configure electron-builder in the desktop app's `electron-builder.yml` (Windows only in version 1, D73):

```yaml
appId: com.yourapp.desktop
productName: Your App
win:
  target: nsis
nsis:
  perMachine: false
publish:
  provider: github
```

5. Switch off the Electron fuses the app does not need, with `@electron/fuses` in an electron-builder afterPack hook, pointing it at the packaged Electron binary for each platform:

```ts
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

await flipFuses(electronBinaryPath, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
});
```

## Automatic updates

6. Add electron-updater to the main process ([source](https://www.electron.build/docs/features/auto-update)):

```ts
import { autoUpdater } from "electron-updater";

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.checkForUpdates();
setInterval(() => autoUpdater.checkForUpdates(), 6 * 60 * 60 * 1000);
```

7. Never restart into an update during a call; offer "restart to update" once the call ends.

## Builds and publishing (D48, D49)

8. Protect the GitHub account first: a hardware security key for sign-in, and protection rules on the main branch and on version tags. Nothing else stops a fake update (D29b).
9. Add `.github/workflows/release.yml`. It runs only on version tags, gives jobs read-only access except where publishing needs write access, and should pin every action to a full commit hash instead of a version name:

```yaml
name: release
on:
  push:
    tags: ["v*"]
permissions:
  contents: read
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest]
    runs-on: ${{ matrix.os }}
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@<pinned commit>
      - uses: pnpm/action-setup@<pinned commit>
      - uses: actions/setup-node@<pinned commit>
        with:
          node-version: 26
          cache: pnpm
      - run: rustup target add wasm32-unknown-unknown
      - run: cargo install wasm-bindgen-cli --version <same as the crate>
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter desktop build
      - run: pnpm --filter desktop exec electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The build step must also build the OpenMLS WebAssembly module (M2).

10. After each release, add the SHA-256 checksum of every installer to the release notes.

## Done when

Every check in the Security checklist is marked done or listed under Risks you accepted, and installers from a tagged release install, run and update themselves on a clean Windows machine.
