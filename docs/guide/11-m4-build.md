# M4 build steps


M4 is desktop polish: the tray and closing behavior, starting at login, notifications, the settings screen and safety numbers. M4 is done when every setting decided for these behaves as decided on Windows, and two members can compare safety numbers on a call.

## Settings

Proposed by me and accepted by you on October 14, 2026.

| Setting | Proposed | Why |
| --- | --- | --- |
| Mute hotkey default | Ctrl+Shift+M | The same default as Discord, so it feels familiar |
| Push-to-talk key default | None until the user picks one | Any default could clash with a game's controls |
| Notifications | One per group, updated as new messages arrive; none for the chat that is open and focused | Avoids a flood of notifications |
| Where settings live | On each device, in its local database | Codec, microphone and Hide my IP depend on the computer |

## Tray and closing

1. Add a tray icon with a menu: Open, Mute or Unmute, and Quit.
2. Closing the window hides it to the tray unless the user chose quit-on-close (D15b). The first time, show a notification saying the app is still running and that opening it again brings the window back (D47).
3. Make opening the app again show the hidden window, using Electron's single-instance lock:

```ts
if (!app.requestSingleInstanceLock()) app.quit();

app.on("second-instance", () => {
  win.show();
  win.focus();
});
```

## Start at login

4. Turn start-at-login on during the first run, and say so on the first screen along with where to turn it off (D46). Started at login, the app opens hidden in the tray.

- Windows: `app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] })`

## Notifications

5. On Windows, call `app.setAppUserModelId` with the same app ID as in electron-builder's configuration, or notifications may not appear.
6. Show notifications from the main process: full preview by default, or sender-only or generic as set (D15). While a screen share is running, always use the generic text, whatever the setting.
7. Clicking a notification opens the window on that group.

## Settings screen

8. Build four sections:

| Section | Settings |
| --- | --- |
| Audio | Microphone mode (voice activity or push-to-talk), push-to-talk key, mute hotkey, input device, voice-activity sensitivity |
| Video | Screen-share codec (D11b) |
| Privacy | Hide my IP (D14), notification previews (D15) |
| App | Start at login (D46), close behavior (D15b) |

Hide my IP takes effect from the next call, since it is set when each call's connections are created.

## Safety numbers

9. Compute each person's half of the number from their username and all their devices' identity keys, the way Signal builds its 60-digit numbers: each side contributes 30 digits, and the two halves are put in a fixed order so both people see the same number.

```ts
import { createHash } from "node:crypto";

function half(username: string, deviceKeys: Buffer[]): string {
  const keys = Buffer.concat([...deviceKeys].sort(Buffer.compare));
  let hash = Buffer.concat([Buffer.from(username), keys]);
  for (let i = 0; i < 5200; i++) {
    hash = createHash("sha512").update(hash).update(keys).digest();
  }
  let digits = "";
  for (let i = 0; i < 6; i++) {
    digits += (hash.readUIntBE(i * 5, 5) % 100000).toString().padStart(5, "0");
  }
  return digits;
}

const safetyNumber = [half(me, myKeys), half(them, theirKeys)].sort().join("");
```

Show it as 12 blocks of 5 digits, with a button to mark the person verified.

10. When someone's keys change (a new device or a reinstall), post a notice in every group you share, such as "Ana's safety number changed", and clear the verified mark.

## Tests

- The safety number is identical on both sides and changes when any device key changes
- Closing, hiding and quitting on Windows
- Start at login on Windows, opening hidden in the tray
- All three notification modes, generic text during a screen share, and clicking through to the group
- Settings survive a restart

## Done when

On Windows, every setting from D11b, D14, D15, D15b, D44 to D44c and D46 behaves as decided, and two members can read their safety numbers to each other on a call and mark each other verified.
