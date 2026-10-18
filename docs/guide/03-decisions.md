# Decision log


Every decision so far, D1 to D100, is made and summarized below. Each one records the options, a recommendation with its reason, and your final choice.

| Decision | Your choice |
| --- | --- |
| D1 Architecture | Hybrid: small backend for text, accounts, signaling and notifications; calls peer-to-peer |
| D2 Call size | Up to about 6 on video, as a mesh |
| D3 Group model | Flat group: one chat plus one drop-in call |
| D4, D4b Platforms | Desktop first: Windows and Linux; no macOS; phones later |
| D5 App framework | Electron |
| D6 Backend language | TypeScript (Node.js) |
| D7 Accounts | Username and password; private keys stay on devices; safety numbers |
| D8 Text encryption | MLS |
| D9 Message history | Server deletes messages after delivery |
| D10 Video in version 1 | Voice and screen sharing; webcam later |
| D11 Codecs | VP8, VP9 and H.264, H.264 by default |
| D11b Codec choice | In settings |
| D12 Group management | Everyone equal |
| D13 Joining | Added by username, with an invitation to accept |
| D14 IP privacy | Direct by default; "Hide my IP" setting relays calls |
| D15 Notifications | Full preview, hidden while screen sharing; setting for sender-only or generic |
| D15b Closing the window | Keeps running in the tray by default; setting to quit instead |
| D16 License | AGPL-3.0 |
| D17 Group size | Up to 10 members |
| D18 Call protection | Call setup encrypted with MLS |
| D19 Backend database | SQLite |
| D20 Local storage | Plain SQLite, relying on the operating system's disk encryption |
| D21 Interface framework | React |
| D22 MLS library | OpenMLS compiled to WebAssembly |
| D23 TURN server | coturn |
| D24 Undelivered messages | Wait up to 30 days |
| D25 Milestone order | Foundation first: backend, chat, calls, polish, release |
| D26 Repository layout | One repository for client, backend and shared code |
| D27 Build and packaging | electron-vite with electron-builder |
| D28 Backend libraries | Fastify with its WebSocket plugin |
| D29, D29b Signing and updates | No paid signing; automatic updates on, unsigned; no extra signature check |
| D30 Wire encoding | JSON, with encrypted payloads in base64 |
| D31 Package manager | pnpm |
| D32 Testing | Vitest |
| D33 Linting and formatting | ESLint with Prettier |
| D34 Backend SQLite library | better-sqlite3 |
| D35 Password hashing | Argon2id |
| D36 Schema library | TypeBox |
| D37 to D37c Session tokens | JWT signed with HS256, expiring within minutes, plus a refresh token stored on the server |
| D38 MLS cipher suite | Suite 1: X25519, AES-128-GCM, SHA-256, Ed25519 |
| D39 MLS state on disk | One blob, saved after every change |
| D40 Group names | Visible to the server |
| D41 Membership changes | Declared by the sender, checked by every member |
| D42 Where calls run | In the main window, hidden rather than closed |
| D43 Screen-share sound | Screen only, no sound |
| D44 to D44c Microphone | Voice activity or push-to-talk (global on Windows, in-front only on Linux), plus a global mute hotkey |
| D45 Safety numbers | 60-digit number blocks, compared aloud or in person |
| D46 Start at login | On by default, with a setting to turn it off |
| D47 Linux without a tray | Close to the tray everywhere; reopening shows the window; one-time notice |
| D48 Release builds | GitHub Actions |
| D49 Publishing | GitHub Releases |
| D50 Linux formats | AppImage, .deb, .rpm and pacman |
| D51 Security review | Your own review only |
| D52 Server hosting | Oracle Cloud Always Free, account converted to pay-as-you-go |
| D53 Port 443 | Shared by name: a router sends each hostname to the backend or the relay |
| D54 Domain | Free DuckDNS names |
| D55 Password recovery | From a logged-in device, or with a recovery code shown at sign-up |
| D56 New devices | Added to the user's groups automatically |
| D57 Blocking | On the server for invitations, and on your device for messages |
| D58 App name | Build with the working title "newcord"; choose the final name before M5 starts |
| D59 Device identity at login | Login sends the identity key; the server matches on account and key and creates the device the first time |
| D60 One account per installation | Switching accounts wipes local data and makes a new key; the server accepts each identity key for one account only |
| D61 Proving key possession | Not required at sign-up or login; MLS signatures already prove it where it matters |
| D62 Reused refresh tokens | Used tokens are kept and marked; presenting one logs that device out |
| D63 License version | AGPL-3.0-or-later |
| D64 Key directory access | Logged-in accounts only in M1; from M2, only accounts you share a group or pending invitation with |
| D65 Server address | Built into each build; release builds use only https and wss |
| D66 Sessions after a password change | Change closes other devices' WebSockets at once; recovery closes all of them |
| D67 Deleting an account | Not in version 1 |
| D68 Checks on pull requests | No CI before M5's release workflow; checks run locally |
| D69 Interface styling | Tailwind CSS, through its Vite plugin |
| D70 Identity in MLS credentials | The account's username and the device's ID |
| D71 Commits that break the rules | Applied, with a notice naming the sender and the real change |
| D72 Removing a lost device | Not in version 1 |
| D73 Platforms in version 1 | Windows only; Linux desktop builds later (narrows D4, moves D47 and D50 out of version 1) |
| D74 Push-to-talk keyboard hook | uiohook-napi |
| D75 TypeScript version | 6.0.x until `typescript-eslint` supports 7 |
| D76 Vite | Declared as a root development dependency |
| D77 Lint and format strictness | Warnings fail lint; type-aware rules plus explicit return types; Markdown not formatted; React hooks plugin only |
| D78 Electron version | Pinned exactly in the desktop app's `package.json` |
| D79 electron-winstaller install script | Denied; NSIS does not use it |
| D80 better-sqlite3 install script | Denied; its prebuilt Node-API binaries are used |
| D81 Logging in again on a device | Deletes that device's other refresh tokens |
| D82 Values filled in while building M1 | See the entry: status codes, database path, secret length, cleanup interval, release address, IPC checks, key directory, WebSocket codes, heartbeat (#17) |
| D83 Where the MLS welcome travels | Inside the commit that adds the devices, stored with it in one step |
| D84 Where the relay's addresses come from | The server's `RELAY_URLS`, returned with each relay password |
| D85 Call messages and time | `call.join`, `call.leave` and `call.signal` carry the sender's time; older than 60 seconds is ignored |
| D86 Who is in a call for a device that missed its start | Learned when it joins, from the Participants' signals; no re-announcing |
| D87 What switching accounts erases | The account's data only; this computer's settings and one-time flags stay |
| D88 Unblocking someone you share no group with | A Blocked list in Settings, under Privacy |
| D89 How production runs the server | Through tsx, with no separate build |
| D90 MLS module functions beyond the guide's table | `groupEpoch`, `groupMembers`, `groupMemberKeys`, and one past epoch kept readable |
| D91 Server behaviour added while building M2 | Leaving devices get the commit removing them; groups re-prompted on key-package upload and on creation; no-recipient messages not stored |
| D92 The app's final name | newcord |
| D93 uiohook-napi's install script | Approved; it only picks the prebuilt binary |
| D94 Rust toolchain on Windows | The GNU toolchain, wasm-bindgen-cli's prebuilt binary, and the crate's tests run as WebAssembly in Node |
| D95 Where the installed app and development runs keep their data | Separate folders: `%APPDATA%\newcord` and `%APPDATA%\newcord-dev` |
| D96 How a tagged release goes out | As a draft, published by hand after a check |
| D97 When the window offers "restart to update" | As soon as an update is downloaded outside a call, and when a call ends with one waiting |
| D98 The installer's publisher and description | "newcord", and a one-line description of the app |
| D99 Automatic checks on pull requests from M5 | Every check on each pull request and push to `main`, on Windows and on Linux Arm |
| D100 The WebSocket heartbeat | A ping every 30 seconds; a socket that leaves one unanswered is ended |

## D1 — Architecture: who carries messages and calls?

"No servers" meant no Discord-style servers (guilds), so backend infrastructure is allowed. This replaces the earlier question about how strict "no servers" had to be.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Own backend for everything | A server you run stores encrypted messages, handles accounts and signaling, and forwards calls through an SFU (for example LiveKit or mediasoup) | Offline messages, history, multiple devices and phone notifications just work; very reliable calls | Most infrastructure to run and pay for; the server sees metadata (who talks to whom, when); most backend code |
| B. Peer-to-peer with helpers | Members talk directly; a small rendezvous service and STUN/TURN only help them connect | Cheapest to run; nothing stored centrally; small calls fit a mesh well | Messages to offline members, multi-device sync and phone notifications are hard; peers see each other's IPs |
| C. Hybrid | A small backend handles accounts, encrypted message storage, signaling and notifications; calls go directly between members as a mesh, with TURN as fallback | Messages behave like a normal chat app; calls need no media server because they stay at 6 or fewer; the server never touches audio or video | Two networking models to build; IPs exposed during calls unless relayed |
| D. Existing protocol (Matrix) | Run a Matrix homeserver (for example Synapse or Conduit) and build your own client on it, using Matrix's own calling stack | E2EE, sync and multiple devices already solved and audited; least backend work | Large, complex protocol; less control over features and UX; the homeserver needs real resources |

Recommendation: C. Because calls stay small (D2), they can run as a mesh with no media server, so the backend only does the cheap, well-understood parts: accounts, encrypted message storage, signaling and notifications. That solves peer-to-peer's hardest problems (offline delivery, multiple devices, phones) while the server stays blind to content. A is the safer pick if calls may grow beyond 6 later.

Your choice: C, hybrid (decided October 14, 2026).

## D2 — How big can a voice or video call be?

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Small, up to about 6 on video | Full mesh: everyone sends directly to everyone | Simplest; truly serverless; lowest latency | Hard ceiling on group size; members on weak connections struggle |
| B. Medium, up to about 15–25 | A member with good bandwidth is elected forwarder (a mini SFU), with automatic handover if they leave | Covers most friend communities | Election and failover logic is complex; the forwarder's upload becomes the bottleneck |
| C. Large, 50 or more | Dedicated SFU media servers, like Discord | Closest to the Discord experience | Needs dedicated media servers: the most infrastructure and cost |

The size of a text group is a separate question and can be much larger than a call.

Recommendation: A for version 1, with the media code built so a forwarder (B) can be added later. It fits the "simple" requirement and needs no infrastructure, while leaving a clear upgrade path.

Your choice: A, small calls of up to about 6 on video (decided October 14, 2026).

## D3 — What is a group?

With no guilds, the group becomes the main unit of the app. This choice sets the data model and how much permission logic is needed.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Flat group | Like a Discord group DM: one shared chat plus one drop-in call members can join anytime | Simplest data model and UI; almost no permissions beyond an admin | One stream of messages per group; side topics need a separate group |
| B. Group with channels | Several text channels and voice rooms inside each group | Topics stay organized; familiar always-on voice rooms | Needs roles and per-channel permissions; drifts back toward Discord servers |
| C. Flat group with threads | One chat and one call, with optional reply threads for side topics | Organized without channels | Threads add sync and notification complexity |

Recommendation: A for version 1. It matches your choice to drop Discord-style servers and keeps permissions trivial; threads (C) can be added later without changing the model.

Your choice: A, flat group (decided October 14, 2026).

## D4 — Target platforms

This sets the app framework (D5) and how hard notifications and background calls will be.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Desktop only first | Windows, macOS and Linux in version 1; phones in a later version | One codebase; WebRTC and screen sharing are mature on desktop; fastest to a working app | Nobody can join from a phone at first |
| B. Desktop and mobile from day one | Windows, macOS, Linux, Android and iOS together | Usable anywhere, which is how people actually chat | Roughly doubles UI and testing work; phones limit background connections and need push services (Apple and Google) for notifications; app store review |
| C. Web app first | Runs in the browser, installable as an app on desktop and phones | Nothing to install; one codebase; WebRTC built into every browser | The server delivers the app's code, so a compromised server could ship code that steals keys, which weakens E2EE; weak background audio and notifications on iPhones |

Recommendation: A for version 1, picking a framework in D5 that can reach phones later. Screen sharing is mainly a desktop feature, and leaving phones out avoids push-notification and background-call problems until the core works. Web (C) is not recommended as the main app because of the E2EE code-delivery risk.

Your choice: A, desktop first (decided October 14, 2026).

## D5 — Desktop app framework

The framework decides how reliable calls and screen sharing are on each desktop, and how hard the later move to phones will be.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Electron | Bundles Chromium and Node.js; UI in TypeScript and React. Discord's own desktop app uses it | Chromium's WebRTC behaves the same on Windows, macOS and Linux, screen sharing included; largest ecosystem and docs | Heavy install and RAM use; a large attack surface that must be hardened carefully; phones later need a separate app |
| B. Tauri | Rust core plus each system's own webview; Tauri 2 also targets phones | Small installs, low RAM; the Rust core is memory-safe, good for crypto code; one path toward phones | Each OS uses a different webview; on Linux that is WebKitGTK, whose WebRTC support has historically been weak, so media may need to move into Rust, which is much more work |
| C. Flutter | Dart UI compiled natively, with a WebRTC plugin | One codebase for desktop and later phones; fast, native-feeling UI | Desktop WebRTC and screen sharing are less mature than Chromium's; the best encryption libraries need bridging from Rust or C |
| D. Native | C++ with Qt, or Rust, directly on the libwebrtc library | Best performance and control, as Discord's own media engine shows | By far the most work; conflicts with "simple" |

Recommendation: A, Electron. For a voice and video app, reliable calls and screen sharing on all three desktops matter most, and Chromium delivers that out of the box. Its security weaknesses are well understood and can be hardened (process isolation, no Node.js access from the UI, strict content rules).

Your choice: A, Electron (decided October 14, 2026).

## D6 — Backend language

The backend from D1 is small: accounts, encrypted message storage, a WebSocket for real-time events and call signaling, and notifications.

| Option | Pros | Cons |
| --- | --- | --- |
| A. TypeScript (Node.js) | Same language as an Electron client, so message formats and code are shared; fastest to build | Handles fewer simultaneous connections per machine than Go or Elixir, though plenty at this scale |
| B. Go | Ships as one small binary that is easy to self-host; strong concurrency; mature WebRTC and TURN libraries (Pion) | A second language next to the client; no shared code |
| C. Elixir (Phoenix) | The same technology as Discord's Gateway; built-in presence and channels | Niche language; more power than this scale needs |
| D. Rust | Fastest and memory-safe; the strongest MLS encryption library (OpenMLS) is Rust | Slowest to write; steepest learning curve |

Recommendation: A, TypeScript, if you pick Electron in D5. One language across client and server is the simplest setup to build and maintain. If you already know Go, B is an equally good choice.

Your choice: A, TypeScript (decided October 14, 2026).

## D7 — Identity and accounts

In every option below, each device creates its own key pair and the private key never leaves it; members can compare safety numbers, as in Signal, to confirm nobody swapped keys. The question is what an account is.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Username and password | The backend maps a username to each user's public keys; the password only logs in, it never unlocks messages | Familiar; friends find you by username; a forgotten password can be reset (old message history cannot) | The backend keeps a user directory; passwords must be stored with a slow hash such as Argon2; a malicious server could swap keys unless members verify |
| B. Key-only identity | The account is the key pair itself, with no username or password; you share an ID, link or QR code | No personal data on the backend; nothing to leak | Lose the device and the account is gone unless a recovery phrase was saved; no search by name; harder for non-technical friends |
| C. Email or phone number | Sign up with email or phone; contacts are found by them | Easiest to find friends; account recovery by email or SMS | Stores personal data; needs email or SMS sending, and SMS costs money; more to protect |

Recommendation: A. It is the simplest for friends to use, keeps personal data minimal (just a username), and the server still never holds private keys. Safety-number verification closes the key-swap risk for anyone who cares to check.

Your choice: A, username and password (decided October 14, 2026).

## D8 — Text encryption for groups

Calls are already encrypted between members by WebRTC in a mesh; this decision covers group text, and whichever protocol wins can also protect call setup.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. MLS (IETF standard, RFC 9420) | A shared group key tree; adding or removing a member updates the key in one step. Discord's DAVE uses it for calls | Built for groups; recovers security after a device is compromised; our backend can act as the ordering service MLS needs; can also protect calls | The most complex to learn; JavaScript support is younger, so the Rust library OpenMLS would likely run as a native or WebAssembly module |
| B. Signal Protocol with Sender Keys | Pairwise sessions distribute one sending key per member, as in Signal and WhatsApp | The most battle-tested; Signal's library (libsignal) already runs in Electron, in Signal's own desktop app | Removing a member means every member re-sends keys; weaker recovery after a compromise in groups; libsignal is AGPL-licensed, which forces your app to be open source under AGPL |
| C. Megolm (Matrix) | Each sender ratchets a group session key, shared over pairwise channels | Designed for group chat; the vodozemac library has JavaScript bindings | Weaker security properties than A or B; Matrix itself is moving toward MLS |

Recommendation: A, MLS. It is the standard designed for exactly this case, the hybrid backend fills the ordering role it needs, and small groups keep its complexity manageable. B is the choice if you prefer the most proven code and accept the AGPL license.

Your choice: A, MLS (decided October 14, 2026).

## D9 — Message history

The backend only ever holds encrypted messages; the question is how long it keeps them. One consequence of MLS applies to every option: a new member sees only messages sent after joining, unless sharing old history is added later.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Delete after delivery | Like Signal: the backend queues each message until every member's devices have fetched it, then deletes it; undelivered messages expire after a set time. History lives only on devices | Most private; least storage; matches MLS's forward secrecy | A new or reinstalled device starts empty unless history is copied from another device; a member offline past the expiry misses messages |
| B. Keep for a fixed window | The backend keeps all messages for a set period (for example 30 days), delivered or not | Members offline for a while still catch up; a new device gets recent history | Ciphertext and metadata sit on the server longer; new devices still need the old keys to read it |
| C. Keep forever | Like Discord: the backend keeps everything; devices back up their keys in encrypted form so a new device can read old messages | Full history on any device, closest to Discord | Storage grows without limit; key backups weaken forward secrecy and add a complex recovery system |

Recommendation: A. It is the most secure and the simplest to build, and it fits MLS naturally. Copying history to a new device can be added later as a device-to-device transfer, without the server ever storing more.

Your choice: A, delete after delivery (decided October 14, 2026).

## D10 — Video scope for version 1

In Electron, webcam and screen sharing use the same WebRTC code, so the difference is mostly interface work and bandwidth. In a mesh, every viewer receives a separate copy of each video, which limits quality.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Voice, webcam and screen sharing | Covers "video streaming" in both senses; closest to Discord | The most interface work; the most upload bandwidth when several people share at once |
| B. Voice and screen sharing; webcam later | Screen sharing (Discord's "Go Live") is the core streaming feature; less to build | No face video at first |
| C. Voice and webcam; screen sharing later | Video calls like any meeting app | Misses the most Discord-like streaming feature |
| D. Voice only; video in version 2 | Fastest to ship; rock-solid audio first | Leaves a stated requirement out of version 1 |

On Linux desktops using Wayland, screen sharing goes through the system's screen-share portal (PipeWire), which behaves differently per desktop environment and needs testing on each.

Recommendation: A. The extra cost over B or C is small in Electron, and calls capped at about 6 (D2) keep the bandwidth manageable, especially once quality adapts to each connection (D11).

Your choice: B, voice and screen sharing; webcam later (decided October 14, 2026).

## D11 — Screen-sharing codec

In a mesh, the person sharing encodes a separate copy of the stream for every viewer, so with 5 viewers the encoding work is done 5 times. That makes the codec's CPU cost as important as its picture quality. WebRTC already lowers quality on its own for each viewer whose connection is weak.

| Option | Pros | Cons |
| --- | --- | --- |
| A. VP8 | Supported everywhere; light on CPU; the most predictable on all three desktops | Small text looks less crisp at the same bandwidth |
| B. VP9 | Sharper text and detail at the same bandwidth | Heavier on CPU, multiplied by every viewer; hardware encoding is uncommon |
| C. H.264 with hardware encoding | Very low CPU when the graphics card does the encoding | Availability and quality vary by graphics card and operating system, and hardware encoding in Chromium on Linux is unreliable |
| D. AV1 | Best quality per bit, with tools made for screen content | Very heavy on CPU without a recent graphics card |

Recommendation: A, VP8, for version 1. It behaves the same on every desktop and keeps the sharer's computer responsive while encoding several copies. Once a prototype exists, measure CPU and quality, then consider VP9 or hardware H.264 as an upgrade.

Your choice: support VP8, VP9 and H.264, with H.264 as the default, and let the user choose (decided October 14, 2026).

Implementation notes for this choice:

- The sharer's codec applies to every viewer's copy; WebRTC lets the app set codec preferences on each connection.
- Confirm in the calls milestone (M3) that the Electron build encodes H.264 on Windows and Linux, and how much CPU it uses on machines without hardware encoding, since the cost repeats per viewer.
- H.264 is covered by patents; check licensing before distributing the app (D16).

## D11b — Where the codec is chosen

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. In settings | A codec setting in preferences, H.264 by default; every share uses it | Simplest; no extra step when sharing | Switching for one share means a trip to settings |
| B. Each time you share | The share dialog shows a codec picker every time | Easy to try codecs per situation | An extra choice on every share, which most people will not understand |
| C. Both | Settings hold the default; the share dialog has an optional override under "advanced" | Flexible without slowing normal use | Two places to build and keep consistent |

Recommendation: A. It keeps sharing one click, and anyone who wants to experiment can still change the setting.

Your choice: A, in settings (decided October 14, 2026).

## D12 — Who can manage a group

With MLS, removing a member is a key update: the removed person cannot read anything sent afterwards. The backend, as MLS's ordering service, checks who is allowed to make these changes, and every client verifies them too.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Single owner | The creator alone can add or remove members and rename the group, and can hand ownership to someone else | Simplest rules; no conflicts | If the owner disappears, nobody can remove a member |
| B. Owner plus admins | The owner can promote members to admin; admins can add and remove members, but not the owner | Shared moderation; no single point of failure; still simple | Needs a small role list and rules for admins removing admins |
| C. Everyone equal | Any member can add or remove anyone | No roles at all | One bad actor can remove everyone else |

Recommendation: B. It keeps the rules small while avoiding a group that gets stuck when its owner leaves or stops using the app.

Your choice: C, everyone equal: any member can add or remove anyone (decided October 14, 2026).

## D13 — How people join a group

With MLS, someone already in the group must be online to add a newcomer; their app does this in the background. Because every member is equal (D12), any member can use whichever method is chosen.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Add by username | A member enters a username; that person gets an invitation to accept or decline | Every addition is deliberate; nothing can leak; declining stops unwanted adds | You need the exact username; people without an account must sign up first |
| B. Invite links | Any member creates a link that expires and has a use limit; anyone holding it can join | Easy to share through other apps; good for new users | A leaked link lets strangers in, and any member can create one |
| C. Both | Usernames and links | Most flexible | More to build; the link risks remain |

Recommendation: A. With every member equal, links that anyone can create and spread are the easiest way for strangers to get in; usernames keep each addition deliberate.

Your choice: A, add by username with an invitation to accept (decided October 14, 2026).

## D14 — IP address privacy during calls

Calls are peer-to-peer (D1), so by default every member in a call sees the others' IP addresses, which Discord avoids by relaying everything. A relay (TURN) server can hide them; media stays end-to-end encrypted either way.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Direct connections | Members connect directly; the relay is used only when a direct link fails | Lowest latency; lowest server cost | Every call member sees every other member's IP address |
| B. Always relay | All call media passes through your TURN server | Nobody in the call sees anyone's IP; works on every network | All call traffic costs server bandwidth; slightly higher latency; every call depends on the server |
| C. User setting | Direct by default; a "Hide my IP" option forces the relay for that user | Each person chooses; relay costs only for those who opt in | One more setting; only people who turn it on are protected |

Recommendation: C. Groups are mostly friends, so direct connections are a reasonable default, and anyone who worries about their IP can turn on the relay for themselves.

Your choice: C, direct by default with a "Hide my IP" setting (decided October 14, 2026).

## D15 — What notifications show

Notifications arrive over the app's existing connection and are decrypted on your computer, so the server never sees their content. The risk is people seeing your screen, including viewers of your screen share.

| Option | Example | Pros | Cons |
| --- | --- | --- | --- |
| A. Full preview | "Ana: are we playing tonight?" | Most useful; read without opening the app | Anyone seeing your screen, or watching your share, can read it |
| B. Sender only | "New message from Ana" | Good balance of privacy and usefulness | You open the app to read |
| C. Generic | "New message" | Most private | Least useful |

Recommendation: A by default, with previews hidden automatically while you are screen sharing, and a setting to switch to B or C. Friend groups want useful notifications, and screen sharing is where a preview would actually leak.

Your choice: A, full preview, hidden while screen sharing, with a setting for sender-only or generic (decided October 14, 2026).

## D15b — What closing the window does

A desktop app only receives messages while it runs.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Keeps running in the tray, like Discord | Notifications keep arriving; calls can continue | Uses some memory all the time; some users find it surprising |
| B. Quits the app | Simple and predictable | No notifications until the app is opened again |

Recommendation: A, with a "quit on close" option in settings. A chat app that goes silent when its window closes misses its main job.

Your choice: keep running in the tray by default, with a setting to quit on close (decided October 14, 2026).

## D16 — License

All the main libraries chosen so far (Electron, OpenMLS) use permissive licenses, so any option below is possible.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Permissive (MIT or Apache-2.0) | Anyone can reuse the code with few conditions; Apache-2.0 adds a patent grant | Others can build closed-source versions |
| B. Copyleft (AGPL-3.0, as Signal uses) | Every modified version, including a modified backend someone runs, must publish its source | Some companies and contributors avoid AGPL |
| C. Closed source | Full control; easier to sell | Nobody can verify the encryption has no backdoor, which undermines trust in an E2EE app |

Recommendation: B, AGPL-3.0. For a security-focused app, public source lets anyone check the encryption, and AGPL keeps modified servers open too. A is the choice if you want the widest reuse.

H.264 patents are a separate matter from the software license: distributing an H.264 encoder can fall under patent pool terms. I am not a lawyer; check the current terms before a public release.

Your choice: B, AGPL-3.0 (decided October 14, 2026).

## D17 — Maximum members per group

Calls hold about 6 people (D2), but a group's text chat can be larger. With everyone equal (D12), every extra member is also someone who can add or remove others.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Up to 10, like Discord group DMs | Close to the call size, so most members can join a call at once; least risk with everyone equal | Excludes larger friend groups |
| B. Up to 50 | Covers most communities | Only about 6 can be in a call at once, so the app needs a "call full" state; more people who can remove others |
| C. Up to 250 or more | Room for big communities | Everyone-equal management becomes risky; far from "simple"; drifts back toward Discord servers |

Recommendation: A. It keeps the group, the call and the everyone-equal rules in proportion. The limit is one setting in the backend and can be raised later if groups outgrow it.

Your choice: A, up to 10 members (decided October 14, 2026).

## D18 — Protecting calls from a compromised backend

WebRTC encrypts each direct call link, but the details that set up that encryption pass through the backend. A compromised backend could swap them and silently sit in the middle of a call.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Trust the backend | Call setup travels over the TLS WebSocket as plain WebRTC signaling | Simplest; standard WebRTC | A compromised backend can intercept calls undetected, breaking "the server never sees content" |
| B. Encrypt call setup with MLS | Call setup messages, including each link's encryption fingerprint, are sent as MLS-encrypted group messages | Closes the gap with little extra code, reusing MLS from D8 | Call setup is slightly slower; depends on everyone's MLS state being in sync |
| C. B plus frame encryption, like Discord's DAVE | Each audio and video frame is also encrypted with MLS-derived keys before sending | Strongest; ready for a media server if one is ever added | The most work; extra CPU per frame, multiplied across the mesh |

Recommendation: B. In a mesh, WebRTC's own encryption is already end-to-end once nobody can swap the fingerprints, and B guarantees that cheaply. C only pays off if a media server is added later.

Your choice: B, encrypt call setup with MLS (decided October 14, 2026).

## D19 — Backend database

The backend stores little: accounts, public keys, group membership and a short-lived message queue.

| Option | Pros | Cons |
| --- | --- | --- |
| A. PostgreSQL | Robust under many simultaneous writes; the usual choice for production servers | A separate service to install, run and back up |
| B. SQLite | A single file inside the backend process; easiest to self-host; fast enough at this scale | One writer at a time; harder to spread across several backend machines later |

Recommendation: B, SQLite. With small groups and messages deleted after delivery, the data stays small, and one process with one file fits "simple". Moving to PostgreSQL later is a well-trodden path if it is ever needed.

Your choice: B, SQLite (decided October 14, 2026).

## D20 — How the client stores messages and keys on disk

Since the server deletes messages after delivery (D9), each computer holds the only copy of the history, plus the private MLS keys. This decides how that data is protected if someone else gets at the computer.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Encrypted SQLite, key in the system keychain | The database is encrypted (SQLCipher); its key is protected by the operating system's keychain through Electron's safeStorage | Everything encrypted at rest; no extra step for the user | A native module to build per OS; on Linux desktops with no keyring running, safeStorage falls back to a weak built-in key |
| B. Plain SQLite | Relies on the operating system's disk encryption | Simplest | Malware running as the user, or anyone at the unlocked computer, can read the history and keys |
| C. Encrypted SQLite, key from a passphrase | The user types a passphrase when the app starts | Strongest; does not depend on a keyring | A passphrase on every start; forgetting it loses the local history |

Recommendation: A, and when no keyring is available on Linux, ask the user to set a passphrase (C) instead of using the weak fallback. That keeps everyday use effortless while never storing keys unprotected.

Your choice: B, plain SQLite (decided October 14, 2026).

Consequence to keep in mind: the private identity and MLS keys sit in a readable file. Anyone who copies it from a running or unlocked computer can read the local history and impersonate the user until their keys are replaced. Full-disk encryption protects a computer that is powered off, not one that is running.

## D22 — How MLS runs from TypeScript

The MLS library is the security core of the app, so maturity matters more than convenience.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. [ts-mls](https://cdn.jsdelivr.net/npm/ts-mls@1.6.2/README.md), pure TypeScript | An MIT-licensed TypeScript implementation of RFC 9420 | No second language or build tooling; runs directly in Electron and Node.js; supports post-quantum algorithms | Younger and smaller project; its own documentation warns it may contain undiscovered vulnerabilities |
| B. OpenMLS through WebAssembly | The Rust library OpenMLS, compiled once to WebAssembly and wrapped for TypeScript | The most mature open-source MLS implementation, in a memory-safe language; one build runs on every desktop and later on phones | Needs the Rust toolchain and a small wrapper layer |
| C. OpenMLS as a native module | OpenMLS compiled into a native Node.js module | Fastest; full access to the Rust ecosystem | Must be compiled separately for every OS, CPU type and Electron version, which adds release work |

Recommendation: B. It puts the most proven MLS code at the center of the app while keeping one portable build. The extra Rust step is small compared with the risk of relying on a younger implementation for the core security.

Your choice: B, OpenMLS through WebAssembly (decided October 14, 2026).

## D21 — Interface framework inside Electron

| Option | Pros | Cons |
| --- | --- | --- |
| A. React | The largest ecosystem and the most examples of chat lists, WebRTC calls and Electron apps; Discord's own interface uses it | More boilerplate; long chat lists need care to stay fast |
| B. Svelte | Less code; fast with small bundles; simple reactivity | Smaller ecosystem and fewer ready-made components |
| C. Vue | Gentle learning curve and good documentation | Fewer chat and WebRTC examples than React |

Recommendation: A, React. For an app built mostly from chat lists, call screens and settings, the volume of existing examples and libraries saves the most time.

Your choice: A, React (decided October 14, 2026).

## D23 — TURN server software

The relay carries calls that cannot connect directly and calls from "Hide my IP" users. In every option, the backend should hand out short-lived relay passwords so only logged-in members can use it.

| Option | Pros | Cons |
| --- | --- | --- |
| A. coturn | The standard open-source TURN server; widely used and documented; supports short-lived credentials | Verbose configuration; a separate program to secure and update |
| B. eturnal | A newer open-source TURN server with simpler configuration and short-lived credentials | Smaller community and fewer guides |
| C. A hosted TURN service from a cloud provider | Nothing to run; servers worldwide | Costs per gigabyte; a third party sees the IP addresses of exactly the users who chose to hide them |

Recommendation: A, coturn. It is the most proven option, and running it yourself keeps "Hide my IP" users' addresses away from third parties.

Your choice: A, coturn (decided October 14, 2026).

## D24 — How long undelivered messages wait

The queue also holds MLS key updates, not just text. A device that misses a key update because it expired falls out of sync with the group, so the app must notice and have an online member re-add it automatically; any messages that expired in the meantime are lost for that device.

| Option | Pros | Cons |
| --- | --- | --- |
| A. 7 days | The least data held on the server | Anyone away for a week, such as on holiday, loses messages and has to be re-added |
| B. 30 days | Covers holidays and most absences; still clearly limited | Encrypted messages and their metadata stay on the server up to a month |
| C. 90 days | Almost nobody misses messages | Three months of queued data; a long-absent device has many key updates to process on return |

Recommendation: B, 30 days. It covers normal absences without turning the queue into long-term storage, which keeps the spirit of D9.

Your choice: B, 30 days (decided October 14, 2026).

## D25 — Milestone order

| Option | Order | Pros | Cons |
| --- | --- | --- | --- |
| A. Risk first | Call prototype, backend, chat, group calls, polish, release | The biggest unknowns (H.264 on each OS, Wayland screen sharing, CPU per viewer) show up before much is built | Some prototype code may be rewritten once the backend exists |
| B. Foundation first | Backend, chat, calls, polish, release | Each milestone builds directly on the last; little throwaway code | Call problems, the riskiest part, appear late, when changing course costs more |

Recommendation: A. The codec and screen-sharing questions from D10 and D11 could still change technical choices, so they are worth answering before the rest is built.

Your choice: B, foundation first (decided October 14, 2026).

## D26 — Repository layout

| Option | Pros | Cons |
| --- | --- | --- |
| A. One repository for client, backend and shared code | Client and backend share message types and the MLS wrapper directly, the main reason for TypeScript on both sides (D6); one place for issues and the AGPL license | Workspace tooling is slightly more involved; every change runs the whole build |
| B. Separate repositories | Clear boundaries; independent releases | Shared code must be published as a package; changes touching both sides need coordinated updates |

Recommendation: A. Sharing code between client and backend is the reason both use TypeScript, and one repository makes that sharing direct.

Your choice: A, one repository (decided October 14, 2026).

## D27 — Electron build and packaging tools

Needed for M1. This covers running the app during development and producing installers for Windows, macOS and Linux.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Electron Forge | The official tool from the Electron project; one tool for scaffolding, building and installers | Fewer Linux package formats out of the box |
| B. electron-vite with electron-builder | Vite gives fast reloads while building the React interface; electron-builder makes the widest range of installers, including several Linux formats, and has built-in automatic updates | Two community tools instead of one official one; more configuration |

Recommendation: B. Fast reloads speed up interface work every day, and broad Linux packaging matters for a desktop-first app that supports Linux.

Your choice: B, electron-vite with electron-builder (decided October 14, 2026).

## D28 — Backend HTTP and WebSocket libraries

Needed for M1. The backend handles sign-up, login and one WebSocket per client.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Fastify with its WebSocket plugin | Fast; built-in validation of every incoming request; plugins for rate limiting; strong TypeScript support | Its plugin system takes some learning |
| B. Express with the ws library | The most widely known; endless tutorials | Older design; no built-in input validation |
| C. Hono | Small, modern and designed for TypeScript | Younger; WebSockets on Node.js go through an adapter |

Recommendation: A, Fastify. Built-in validation and rate limiting are exactly what a security-focused backend needs on every request, and it is mature.

Your choice: A, Fastify (decided October 14, 2026).

## D29 — Code signing and automatic updates

Needed for M5. Unsigned apps trigger warnings: Windows shows an "unknown publisher" screen, and macOS blocks unsigned apps from opening normally. Automatic updates on macOS also require a signed app.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Sign on Windows and macOS, with automatic updates | No security warnings; security fixes reach every user quickly; signatures prove updates come from you | Yearly costs: Apple's developer program has an annual fee, and Windows certificates vary by provider; setup work |
| B. Sign on macOS only, with automatic updates | Lower cost; macOS, the strictest platform, works smoothly | Windows users see "unknown publisher" warnings |
| C. No signing and no automatic updates | Free and simplest | Warnings on both platforms; users keep running old versions with known security bugs |

Recommendation: A. For an encrypted app, getting security fixes to everyone fast matters as much as the encryption itself, and signed updates make sure nobody can push a fake one.

Your choice: no paid code signing; automatic updates on, unsigned, through electron-builder's updater (decided October 14, 2026). You expect no Mac users and few Linux users.

What this means in practice:

- Unsigned automatic updates work on Windows and for Linux AppImages. macOS would require signing, so Mac users would have to update by hand.
- Windows shows an "unknown publisher" warning when someone first installs the app.
- Without a signature, an update is only as trustworthy as the place it is published: whoever controls the release account can push an update to every user. D29b covers a free way to close that gap.

## D29b — Your own signature check on updates

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Check your own signature | You create a free signing key; your release script signs each update; the app checks it against a public key built into the app before installing | A hijacked release account cannot push a fake update without your private key; no certificate cost | Custom code in the update flow; you must guard the private key, and losing it means users reinstall by hand |
| B. No extra check | Rely on HTTPS and the release account alone | No extra work | Anyone who takes over the release account can ship malware to every user, a prime target for an encrypted app |

Recommendation: A. It gives most of the protection of paid signing for free, and protecting updates matters as much as the encryption itself.

Your choice: B, no extra check (decided October 14, 2026).

## D4b — Platforms for version 1, revisited

You expect no Mac users and few Linux users, so D4's three desktops may be more than version 1 needs.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Windows only | One OS to test and package; no Wayland screen-sharing work | You cannot run the app on a Linux computer; adding platforms later means catching up on their bugs |
| B. Windows and Linux | If you develop on Linux, you run your own app every day; Electron makes Linux cheap to keep | Wayland screen sharing still needs testing in M3 |
| C. Keep all three | Nothing to revisit later | Testing needs a Mac; unsigned Mac apps open only with workarounds and cannot update automatically |

Recommendation: B if you develop on Linux, otherwise A. Testing on the computer you build on catches problems the moment they appear.

Your choice: B, Windows and Linux (decided October 14, 2026). This replaces the three desktops of D4.

## D30 — Wire encoding

| Option | Pros | Cons |
| --- | --- | --- |
| A. JSON, with encrypted payloads in base64 | Readable while debugging; the same validation approach as the Fastify routes | Base64 makes encrypted payloads about a third larger |
| B. MessagePack or CBOR | Compact; encrypted payloads travel as raw bytes | Needs a decoder to read traffic while debugging |
| C. Protocol Buffers | Strict schemas with built-in versioning; compact; generated code for later phone apps | A schema build step; the least readable |

Recommendation: A. Messages are small (text in groups of up to 10), so the size overhead hardly matters, and readable traffic makes M1 and M2 much easier to debug. Because the encoding sits behind the shared types, switching later stays contained.

Your choice: A, JSON (decided October 14, 2026).

## D31 — Package manager

Needed for M1. It installs dependencies and links the client, backend and shared code inside the one repository (D26). Installing packages is also a common route for malware, through scripts that run automatically during installation.

| Option | Pros | Cons |
| --- | --- | --- |
| A. npm | Comes with Node.js; nothing extra to install; the most familiar | Slower; lets code use packages it never declared; runs every dependency's install scripts |
| B. pnpm | Fast and disk-efficient; strict about undeclared packages; recent versions block dependency install scripts unless you allow them | One extra tool; electron-builder has historically needed pnpm's "hoisted" layout setting; Electron's own install script must be explicitly allowed |
| C. Yarn | Workspace features and rules for keeping versions consistent | Its default layout does not work well with Electron packaging, so it needs extra configuration |

Recommendation: B, pnpm. Blocking install scripts by default closes a real supply-chain hole for a security-focused app, and its strictness catches mistakes early. The two Electron settings are a one-time setup.

Your choice: B, pnpm (decided October 14, 2026).

## D32 — Testing framework

Needed for M1. Each milestone's gate is easiest to prove with automated tests that run on every change.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Vitest | Runs TypeScript directly; shares configuration with electron-vite, which is built on Vite; familiar Jest-style API | Younger than Jest |
| B. Jest | The best-known JavaScript test framework; the most guides | TypeScript and modern modules need extra setup; slower |
| C. Node.js's built-in test runner | No dependency at all | Fewer features for mocking and snapshots; less tooling around it |

Recommendation: A, Vitest. It fits the Vite-based setup already chosen in D27 with almost no extra configuration.

Your choice: A, Vitest (decided October 14, 2026).

## D33 — Linting and formatting

Needed for M1. Linting catches bugs and risky code patterns automatically; formatting keeps the code style consistent.

| Option | Pros | Cons |
| --- | --- | --- |
| A. ESLint with Prettier | The standard pair; the widest set of rules, including React hook rules and security-focused plugins | Two tools to configure; slower |
| B. Biome | One fast tool for both jobs; minimal configuration | Fewer rules and no plugin ecosystem comparable to ESLint's |

Recommendation: A. For a security-focused app, the extra rules, especially security and React hook checks, are worth the extra configuration.

Your choice: A, ESLint with Prettier (decided October 14, 2026).

## D34 — SQLite library for the backend

Needed to finish M1 (accounts and the key directory).

| Option | Pros | Cons |
| --- | --- | --- |
| A. better-sqlite3 | Mature, fast and widely used; simple synchronous API | A native module that must match the Node.js version on the server |
| B. Node.js's built-in SQLite module | No dependency and no native build | Newer, with a smaller API; how stable it is depends on the Node.js version |

Recommendation: A. Maturity matters more than one fewer dependency for the server's only database.

Your choice: A, better-sqlite3 (decided October 14, 2026).

## D35 — Password hashing

Needed to finish M1. The hash protects passwords if the database ever leaks.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Argon2id | The current first choice of security guidance; uses lots of memory, which slows down cracking with graphics cards | A native module |
| B. scrypt, built into Node.js | No dependency; also memory-hard and widely accepted | Its cost parameters must be tuned by hand |
| C. bcrypt | Very widely used | Not memory-hard; ignores anything past the 72nd byte of a password |

Recommendation: A, Argon2id, as D7 anticipated. It is the strongest of the three, and the native module is a one-time setup on the server.

Your choice: A, Argon2id (decided October 14, 2026).

## D36 — Schema library for the shared message types

Needed to finish M1. The shared package defines every envelope and request once; this library turns those definitions into both TypeScript types and runtime validation.

| Option | Pros | Cons |
| --- | --- | --- |
| A. TypeBox | Produces standard JSON Schema, which Fastify validates natively; the same schemas check HTTP requests and WebSocket envelopes | Wordier syntax |
| B. Zod | Very popular and pleasant to write | Fastify needs an extra adapter; WebSocket messages are validated separately from the routes |

Recommendation: A, TypeBox. One set of schemas checked the same way everywhere is the simplest way to make sure nothing unvalidated reaches the backend, which was the main reason for choosing Fastify (D28).

Your choice: A, TypeBox (decided October 14, 2026).

## D37 — Session tokens after login

Needed for M1. After login, the app shows a token each time it opens the WebSocket. Because local storage is unencrypted (D20), this token sits in a readable file too, so being able to cancel it matters.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Random tokens stored on the server | A long random value; the server keeps a hash of it in SQLite and checks it on each connection | Can be cancelled instantly, for one device or all; simple and hard to get wrong | One database lookup per new connection, negligible at this scale |
| B. Signed tokens (JWT) | The server signs a token that proves itself without a lookup | No database lookup | Hard to cancel before it expires; easy to misconfigure |

Recommendation: A. Cancelling a stolen device's token instantly is worth far more than skipping a lookup on a connection that stays open for hours.

Your choice: B, signed tokens (JWT) (decided October 14, 2026). Because a JWT cannot be cancelled on its own before it expires, D37b decides how long tokens live and how a stolen one gets cut off.

## D37b — Token lifetime and cancelling

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Short access token plus refresh token | A JWT that expires within minutes, plus a long-lived refresh token stored on the server and used to get new JWTs | A stolen device is cut off within minutes by cancelling its refresh token; the standard pattern | Two tokens and refresh logic; open WebSockets must also be closed when a device is cut off |
| B. One long-lived JWT | A single JWT valid for weeks | Simplest | A stolen token keeps working until it expires, and with unencrypted local storage (D20) it is easy to copy |
| C. JWT plus a list of cancelled tokens | The server checks each token against a list of cancelled IDs | Instant cancelling | Brings back the database lookup that JWT was meant to avoid |

Recommendation: A. It keeps JWT's no-lookup checks for everyday requests while still letting you cut off a stolen device quickly.

Your choice: A, short JWT plus refresh token (decided October 14, 2026).

## D37c — JWT signing algorithm

| Option | Pros | Cons |
| --- | --- | --- |
| A. HS256, a shared secret | Simplest; fine when only the backend signs and checks tokens | Anyone holding the secret can create valid tokens, so it must never leave the server |
| B. EdDSA, an Ed25519 key pair | Only the private key can create tokens; other services can check them with the public key | Slightly more setup and key handling |

Recommendation: A. A single backend both creates and checks every token, so a long random secret kept only on the server is enough.

Your choice: A, HS256 (decided October 14, 2026).

## D38 — MLS cipher suite

Needed before M2, but it shapes the identity keys created at sign-up in M1. A cipher suite fixes the exact algorithms MLS uses, and every member of a group must use the same one.

| Option | Algorithms | Pros | Cons |
| --- | --- | --- | --- |
| A. Suite 1 | X25519, AES-128-GCM, SHA-256, Ed25519 | The one suite every MLS implementation must support | WebAssembly cannot use the CPU's AES instructions, so AES runs slower in software |
| B. Suite 3 | X25519, ChaCha20-Poly1305, SHA-256, Ed25519 | Same key types as A; ChaCha20 was designed to be fast and safe in pure software, which suits WebAssembly | Optional in the standard, so other MLS clients may not support it, which only matters for interoperability |
| C. A post-quantum hybrid suite | Adds a post-quantum key exchange | Protects today's messages against future quantum computers | Experimental in some libraries; larger keys; support in OpenMLS would need checking |

Recommendation: B. Your MLS code runs as WebAssembly (D22), where ChaCha20 is both faster and easier to keep side-channel safe than software AES, and the app does not need to talk to other MLS clients.

Your choice: A, suite 1 (decided October 14, 2026). Consequence: inside WebAssembly, AES runs in software, so make sure the AES implementation OpenMLS uses there is a constant-time one, and measure encryption speed during M2.

## D39 — How the app saves its MLS state

Needed for M2. OpenMLS keeps each device's group keys and group state in a storage layer the app provides, and it all must survive restarts.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. One saved blob | OpenMLS's in-memory storage is serialized and written to the local database after every change, as other OpenMLS projects do ([example](https://docs.rs/crate/parley-md/latest/source/src/state.rs)) | The simplest bridge between WebAssembly and the app: just save and load; the state stays small with groups of 10 | The whole state is rewritten each time; a crash between a change and its save puts that device out of sync until it is re-added (D24) |
| B. Row-by-row storage | A custom OpenMLS storage layer whose reads and writes call into better-sqlite3 | Every change is saved as it happens; better-sqlite3's synchronous API fits OpenMLS's synchronous storage interface | Much more binding code across the WebAssembly boundary |

In both options, the app saves before sending anything to the server, and the local database runs with SQLite's secure\_delete setting on, so deleted keys are actually erased; forward secrecy depends on old keys being gone.

Recommendation: A. With small groups it is the least code and the fewest ways to get the WebAssembly bridge wrong, and the recovery path for a rare crash already exists.

Your choice: A, one saved blob (decided October 14, 2026).

## D40 — Group names

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Encrypted | The name lives inside the group's MLS-encrypted state, so only members see it; an invitation shows only who invited you | The server never learns what groups are called | An invitee sees the group's name only after joining |
| B. Visible to the server | The name is stored in plain text with the group | Invitations can show the name; simpler | The server, and anyone who breaches it, sees every group's name, which can reveal a lot |

Recommendation: A. Group names often say more than people expect, and keeping them encrypted costs only a small delay in the invitation.

Your choice: B, visible to the server (decided October 14, 2026). Invitations can show the group's name, and the server stores every group's name in plain text.

## D41 — How the server learns about membership changes

The server must know each group's members to deliver messages and enforce the 10-member limit (D17).

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. The server reads public commits | Commits travel unencrypted but signed, and the server parses them with the same OpenMLS module | The server sees exactly what changed | Depends on OpenMLS exposing a commit's contents without the group's state, which still needs confirming; commits cannot be encrypted |
| B. The sender declares the change | The envelope states who was added or removed; every member's app checks that against the real commit and also enforces the 10-member limit | Works regardless of library details; commits can stay fully encrypted | A dishonest member's app could misdeclare a change, though every other member detects it at once |

Recommendation: B. It relies on nothing unconfirmed, keeps commits encrypted, and the members' own checks make the limit hold even if the server is misled.

Your choice: B, the sender declares and members check (decided October 14, 2026).

## D42 — Where calls run inside the app

Needed for M3. WebRTC only exists in Electron's window processes, not in the main process that holds the keys, so calls must live in a window.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. In the main window | The call runs in the interface's window; closing to the tray hides that window instead of destroying it | The simplest: one window, little plumbing | The hidden window keeps the whole interface in memory; if the interface crashes or reloads, the call drops |
| B. A dedicated hidden call window | A separate invisible window runs only the call; the interface controls it through the main process | Calls survive the interface closing or reloading; call code is kept apart from the interface | Three-way plumbing between interface, main process and call window |

Recommendation: A. For a small app it is far less code, and hiding the window on close already keeps calls alive in the tray (D15b).

Your choice: A, in the main window (decided October 14, 2026).

## D43 — Sound when sharing a screen

Needed for M3. Electron can capture the computer's sound along with the screen on Windows; on Linux, PipeWire capture returns a single screen or window chosen by the user, and system sound is not captured the same way ([source](https://electronjs.org/fr/docs/latest/api/desktop-capturer)). Capturing system sound also picks up the call's own voices, which can echo back to the others, so this needs testing whichever way you choose.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Screen only, no sound | Identical on Windows and Linux; nothing extra to build | No sound when sharing a game or video, a big part of Discord's screen sharing |
| B. Sound on Windows; screen only on Linux for now | Windows users, most of yours, get sound with little effort | Linux sharers send no sound; the feature differs by OS |
| C. Sound on both, with a PipeWire workaround on Linux | The same feature everywhere | Virtual audio devices on Linux are fragile and need much more testing |

Recommendation: B. It gives most users the feature they expect from Discord at low cost, and Linux can follow once the Windows version works.

Your choice: A, screen only (decided October 14, 2026).

## D44 — How the microphone turns on

Needed for M3. Electron's global shortcuts only detect a key being pressed, not released, so true push-to-talk while another app is in front needs a native keyboard hook ([source](https://github.com/Vencord/Vesktop/pull/326)), and Wayland blocks global key listening by design ([source](https://github.com/tauri-apps/tauri/issues/4364)).

| Option | Pros | Cons |
| --- | --- | --- |
| A. Voice activity, plus a global hotkey to toggle mute | Works while gaming on Windows, since toggling only needs a key press; works the same on Linux where shortcuts are supported | No true push-to-talk |
| B. A, plus push-to-talk while the app window is focused | Push-to-talk without system-wide key hooks | Push-to-talk stops working when a game is in front, which is when people want it |
| C. Global push-to-talk through a native keyboard hook | Works while gaming on Windows | A native module to maintain; does not work on Wayland |

Recommendation: A. Voice activity is Discord's default and works everywhere, and the mute hotkey covers the moments people need silence. Global push-to-talk on Windows can be added later.

Your choice: both voice activity and push-to-talk, as options in settings (decided October 14, 2026). D44b settles where push-to-talk works, and D44c whether the global mute hotkey stays.

## D44b — Where push-to-talk works

| Option | Pros | Cons |
| --- | --- | --- |
| A. Only while the app window is in front | Works the same on Windows and Linux; no native code | Does not work while a game or another app is in front, which is when push-to-talk matters most |
| B. Globally on Windows through a native keyboard hook; only while the app is in front on Linux | Works while gaming on Windows, where most users are | A native module to maintain and approve during install; behaves differently on Linux, where Wayland blocks global keys |

Recommendation: B. Push-to-talk is mostly used while gaming, so the in-front-only version would rarely help, and Windows covers most of your users.

Your choice: B, global on Windows (decided October 14, 2026).

## D44c — Global mute hotkey

| Option | Pros | Cons |
| --- | --- | --- |
| A. Keep a global hotkey that toggles mute | Works while gaming, since toggling only needs a key press, which Electron supports; useful with voice activity | One more setting |
| B. No mute hotkey | Nothing extra | Muting requires switching to the app |

Recommendation: A. It is a few lines of code and gives voice-activity users a quick way to go silent.

Your choice: A, keep it (decided October 14, 2026).

## D45 — How members compare safety numbers

Needed for M4. A safety number is derived from two people's identity keys; if both see the same number, nobody swapped keys between them (D7). It changes when someone adds a device or reinstalls, and the app should then say so in the chat.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Number blocks, as in Signal | 60 digits in 12 blocks of 5, read aloud on a call or compared in person | Works without a camera, over any channel | Tedious to compare |
| B. QR code | One person scans the other's code | Fast and exact | Needs a camera, and webcams are not in version 1; scanning between two desktops is awkward |
| C. A short emoji sequence | Both people start a live check and compare a handful of emoji, as in Matrix | Quick and friendly | Needs an interactive protocol with both people online at once; more to build |

Recommendation: A. It fits a desktop app with no camera support, it needs no extra protocol, and a voice call is the natural place to read it out.

Your choice: A, number blocks (decided October 14, 2026).

## D46 — Start when the computer starts

| Option | Pros | Cons |
| --- | --- | --- |
| A. On by default, with a setting to turn it off | Messages and invitations arrive without opening the app, as with Discord | Starting automatically without asking can annoy people |
| B. Off by default, with a setting to turn it on | Respects the user's choice | People who do not find the setting miss messages until they open the app |
| C. Not offered | Nothing to build | No way to have it start automatically |

Recommendation: B. Users can opt in with one click, and an app that starts itself without asking undermines trust in a security-focused product.

Your choice: A, on by default (decided October 14, 2026). The first run tells the user it will start with the computer and where to turn that off.

## D47 — Closing to the tray on Linux desktops without a tray

Some Linux desktops, such as GNOME without an extension, show no tray icons, so a window hidden to the tray would leave no visible way back.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Keep closing to the tray everywhere; opening the app again brings the hidden window back, and the first close shows a notice that it is still running | The same behavior on every desktop; notifications and calls keep going | Users without a tray may think the app quit until they see the notice |
| B. On Linux, minimize instead of hiding | Always visible in the taskbar | Different from Windows; the window stays in the taskbar |
| C. On Linux, quit when the window closes | Simple and predictable | No notifications or calls after closing on Linux |

Recommendation: A. Electron's single-instance lock makes "open it again" reliably bring back the hidden window, and the one-time notice removes the confusion.

Your choice: A, close to the tray everywhere, with a one-time notice (decided October 14, 2026).

## D48 — Where releases are built

Needed for M5. Because updates carry no signature (D29b), whatever builds and publishes a release can push code to every user.

| Option | Pros | Cons |
| --- | --- | --- |
| A. GitHub Actions | A fresh machine for every build, with Windows and Linux runners and a log of each build; free for public repositories | The GitHub account and its workflows become the most valuable target to protect |
| B. Your own clean machine | Fully under your control | Manual steps; the machine drifts over time; Windows builds need a Windows machine or extra tooling |
| C. Self-hosted CI on your server | Under your control and automated | Another service to run, update and secure |

Recommendation: A. Fresh build machines and build logs are the strongest protection available without signatures, provided the account uses a hardware key and workflows are locked down.

Your choice: A, GitHub Actions (decided October 14, 2026).

## D49 — Where installers and updates are published

| Option | Pros | Cons |
| --- | --- | --- |
| A. GitHub Releases | Free; electron-builder publishes there directly and the updater reads it natively | Updates depend on the same account that holds the code |
| B. Your own server | Full control over hosting | If that server is breached, an attacker can push an update to everyone, and it is one more thing to keep running |

Recommendation: A. A GitHub account protected by a hardware key is harder to break into than a self-run file server, and it removes a moving part.

Your choice: A, GitHub Releases (decided October 14, 2026).

## D50 — Linux package formats

The updater handles AppImage, .deb, .rpm and pacman packages ([source](https://www.electron.build/docs/features/auto-update)). Only AppImage updates without asking for an administrator password, and because electron-builder does not sign Linux packages, .deb and .rpm updates skip the package manager's signature checks by default ([source](https://github.com/electron-userland/electron-builder/releases/tag/electron-updater@7.0.0-alpha.5)).

| Option | Pros | Cons |
| --- | --- | --- |
| A. AppImage only | One file that runs on any distribution; updates silently, without an administrator prompt | Not installed through the system's package manager |
| B. AppImage plus .deb, .rpm and pacman | Native packages for each family of distributions | Updates ask for an administrator password and skip signature checks; four formats to test |
| C. AppImage plus pacman | A native package for Arch-based systems | pacman support is still in beta; the same password and signature issues as B |

Recommendation: A. It is the only format that updates smoothly and without weakened checks, and with few Linux users one format is plenty.

Your choice: B, AppImage plus .deb, .rpm and pacman (decided October 14, 2026). Updates to the three native packages ask for an administrator password and skip signature checks; this is listed under Risks you accepted.

## D51 — Security review before release

| Option | Pros | Cons |
| --- | --- | --- |
| A. Your own review only | Free; uses the security checklist and automated tools | You are checking your own work |
| B. Your own review, then a public beta with the source published | Outside eyes on the code for free, as AGPL already requires the source to be public (D16) | Depends on people being interested enough to look |
| C. Your own review plus a paid external audit | The strongest assurance for the encryption and the server | Expensive |

Recommendation: B. A beta period with public source gives real outside review at no cost; a paid audit can follow if the app grows.

Your choice: A, your own review only (decided October 14, 2026). This is listed under Risks you accepted.

## D52 — Where the server runs

Needed for M5. The backend, its SQLite file and coturn need one always-on machine with a public IP address, open UDP ports and port 443 (M3 settings).

| Option | Cost | Pros | Cons |
| --- | --- | --- | --- |
| A. A small rented virtual server (VPS) | A few dollars a month | Reliable; public IP address, any ports, full control | You maintain the operating system and its updates |
| B. Oracle Cloud's Always Free virtual machine | Free; a card is needed to sign up | A full machine with a public IP address and open ports, so the backend, SQLite and coturn all fit; the free allowance includes Arm machines with several cores and gigabytes of memory ([source](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)) | Free Arm capacity is often unavailable; Oracle may reclaim machines it considers idle over 7 days, which a quiet chat server can be, unless the account is converted to pay-as-you-go, which keeps free resources free ([source](https://blog.51sec.org/2023/02/oracle-cloud-cleaning-up-idle-compute.html?m=1)); free terms can change |
| C. A computer at home | Free | No provider involved | Home connections often lack a stable public IP or block incoming ports, especially behind carrier NAT; calls through the relay use your home upload; your home IP becomes public |
| D. Vercel | Free on the Hobby plan | You already have an account | Cannot run this server: no UDP for coturn, no lasting disk for SQLite, and its WebSockets are in public beta, with each connection lasting only as long as a function may run ([source](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)) |

Recommendation: B, since you want it free. Convert the account to pay-as-you-go so the server is not reclaimed for being idle (you pay only beyond the free limits), and keep A as the fallback if no free capacity is available or the free terms change. Vercel can still host a download page for the app.

Your choice: B, Oracle Cloud Always Free, converted to pay-as-you-go (decided October 14, 2026).

## D53 — Sharing port 443 between the backend and the relay

Needed for deployment. The backend serves HTTPS and WebSockets on port 443, and the relay also uses 443 so strict firewalls let it through (M3). One machine with one IP address cannot give both the same port without help.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Route by name on port 443 | A small router in front (nginx's stream module) reads only the requested hostname, without decrypting, and sends the app's name to the backend and the relay's name to coturn | Both on 443, so strict firewalls work for both | One more component to configure and test |
| B. Backend on 443, relay on its standard port 5349 | Each service gets its own port | Simplest | Firewalls that allow only port 443 block the relay, weakening M3's strict-firewall test |
| C. A second public IP address for the relay | Each service gets 443 on its own address | Clean separation | More network setup, and the free allowance for extra addresses would need checking |

Recommendation: A. It is the only option that keeps the relay reachable from strict firewalls without extra addresses, and the router is a few lines of configuration.

Your choice: A, route by name (decided October 14, 2026).

## D54 — Domain name

Needed for deployment. Security certificates and routing by name (D53) both need hostnames, such as app.your-domain and turn.your-domain.

| Option | Cost | Pros | Cons |
| --- | --- | --- | --- |
| A. Your own domain | Usually a small yearly fee | Fully yours; any hostnames you want; looks trustworthy | A yearly cost and a renewal to remember |
| B. A free dynamic-DNS subdomain, such as DuckDNS | Free | No cost | Hostnames sit under someone else's domain, on a volunteer-run service; check that it resolves the two names you need |

Recommendation: A. The domain is the address every copy of the app trusts, so for a security-focused app it is worth owning, but B works if keeping everything free matters more.

Your choice: B, free DuckDNS names (decided October 14, 2026). DuckDNS shares one TXT record across a name and everything under it, which breaks certificate requests that cover several names at once ([source](https://community.letsencrypt.org/t/please-fix-the-wildcard-dns-validation-requirements/108250)), so deployment uses two separate DuckDNS names, each with its own certificate checked over HTTP.

## D55 — Recovering a forgotten password

Needed for M1. Accounts have no email or phone number (D7), so there is no standard way to reset a password. In every option, recovery restores the account and username only: message history lives only on devices (D9), and groups must re-add a device that lost its keys.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Recovery code | At sign-up the app shows a long random code once; the server stores only its hash; the code sets a new password | Works even if every device is lost; no personal data | People lose the code; anyone holding it can take over the account |
| B. Reset from a logged-in device | Any device still logged in can set a new password | Nothing to keep safe | Useless if every device is lost or logged out |
| C. No recovery | A forgotten password means creating a new account | Nothing to build, nothing to steal | Harsh: friends must re-invite you to every group |
| D. Both A and B | A logged-in device resets the password directly; the code covers losing every device | Covers both situations | Both flows to build |

Recommendation: D. Most forgotten passwords happen while a computer is still logged in, which B handles with no extra step, and the recovery code covers the rare case of losing everything.

Your choice: D, both a recovery code and reset from a logged-in device (decided October 14, 2026).

## D56 — Adding a second computer

Needed for M2. A new device creates its own keys at login (D7), but it reads nothing until it is added to each group as a new MLS member. It never sees messages sent before it joined. The question is who lets it in, since anyone who steals a password could log in a device of their own.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Automatic | Any member's app adds the new device to the user's groups as soon as it appears | Seamless | A stolen password silently adds an attacker's device to every group |
| B. Approved from an existing device | The user's other device shows the new device's details; once approved, it adds the new device to each group | A stolen password alone is not enough to read anything | Needs another device of the user's online; if every device was lost, the user is re-invited to groups instead |
| C. Automatic, with a visible notice | Added automatically, and every member sees a safety-number change they can check | Seamless, with some visibility | Relies on members noticing and acting |

Recommendation: B. For a security-focused app, a password should never be enough to read someone's groups, and losing every device is already handled by being re-invited.

Your choice: A, automatic (decided October 14, 2026). Members still see a notice and a safety-number change when someone adds a device (D45); the remaining risk is listed under Risks you accepted.

## D57 — Leaving a group and blocking people

Needed for M2. In MLS, a member cannot complete their own removal: the leaver's app sends a removal request, and the next member online completes it. Meanwhile the server stops delivering to the leaver at once, and their app deletes the group. The open question is blocking.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Block on your device only | Your app hides that person's invitations and messages | The server learns nothing | Their invitations still arrive, just hidden |
| B. Block on the server | The server refuses that person's invitations to you | Stops invitation spam at the source | The server learns who blocks whom |
| C. Both | The server refuses their invitations, and your app hides their messages in groups you still share | The fullest protection | Both parts to build; the server learns who blocks whom |

In a shared group, blocking cannot stop the other person reading your messages; with everyone equal (D12), removing them from the group is the way to do that.

Recommendation: C. The server already sees who invites whom (Message formats), so refusing invitations there adds little new metadata, and hiding messages locally covers groups you share.

Your choice: C, both (decided October 14, 2026).

## D58 — The app's name during development

The name replaces every placeholder in the guide (`your-app`, `@your-app/shared`, `com.yourapp.desktop`, `yourapp.duckdns.org`, …). Most uses are cheap to rename at any time, but the electron-builder `appId` sets the install identity and the update channel, so changing it after a release orphans existing installs; the DuckDNS names and certificates are also first used in M5.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Working title until M5 | Build M1 to M4 with "newcord"; choosing the final name and replacing it everywhere is a gate before M5 starts | M1 starts now; every rename happens before anything ships, while it is cheap | One search-and-replace pass later |
| B. Final name now | Choose the name before writing any code | Done once, no rename pass | Blocks M1 on a choice with no technical urgency |
| C. Literal placeholders | Keep `your-app` in the code until the name is chosen | Clearly not final | Ugly in the interface and logs; the same rename pass as A |

Recommendation: A. Nothing irreversible depends on the name until the first release, so building now and renaming before M5 costs one search-and-replace pass.

Your choice: A, build with "newcord" and choose the final name before M5 starts (decided October 14, 2026).

## D59 — How a device identifies itself when it logs in

Found while planning M1: Message formats said Log in carries only a username and password, while the M1 build steps had login register the device's identity key the first time, and nothing said who creates a device's ID or how a returning device is recognised. A user's second computer is created at login (which later triggers D56), and a device that logs out and back in must be recognised as the same device rather than counted again.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Login always sends the identity key | Login carries the username, password and identity key, like Register; the server finds the device by account and key, or creates it with a random ID it returns | Register and login look alike; one rule covers new and returning devices; the ID reveals nothing | Every login resends a public key the server may already have |
| B. First login sends the key, later ones the device ID | Login carries the identity key or the device ID; the app keeps the ID | Slightly smaller requests | Two request shapes and more app state; a lost ID with the key kept creates a duplicate device |
| C. The ID is computed from the key | Login carries the identity key; the device ID is a hash of it | No stored ID and no lookup | The ID and key are tied forever; a changed key looks like a new device |

Recommendation: A. It is the smallest change that makes both files agree and keeps one request shape.

Your choice: A, login always sends the identity key (decided October 14, 2026). Register and login both return the device's ID with the tokens, and the devices table has one row per account and identity key; D60 tightened this so a key belongs to only one account.

## D60 — One identity key per account

Found while planning M1: the identity key was created once per installation, so an installation that logged out of one account and into another would register the same public key for both. The key directory is public, so anyone could compare two accounts' keys and learn they belong to the same person.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. One account per installation | Logging back in to the same account reuses the key; logging in to a different account warns, wipes the local database and creates a new key, making a new device | Accounts cannot be linked; the app's local data covers one account at a time, which keeps M2's MLS state simple | Switching accounts erases that installation's local history; two accounts on one machine are not supported |
| B. A key per account, side by side | Each account on the installation gets its own key and its own local data | Unlinkable, and switching keeps both accounts' data | Effectively multi-account support: keys, tokens, MLS state and history all kept per account |
| C. One key per installation | As first written | No extra work | Anyone can link accounts through the public key directory |

As a backstop to A or B, the server accepts each identity key for one account only, so a faulty app cannot link two accounts; this replaces D59's per-account rule.

Recommendation: A with the backstop. Unlinkable accounts matter for a privacy-focused app, and keeping one account per installation avoids building multi-account support.

Your choice: A, one account per installation, with the server accepting each identity key for one account only (decided October 14, 2026).

## D61 — Proving a device holds its identity key

Found while planning M1: sign-up and login accept whatever public identity key the request carries, without the device proving it holds the matching private key.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Signed server challenge | A new endpoint issues a one-time random value; sign-up and login must include the device's signature over it | The key directory only holds keys their owners proved they hold; common practice | A new endpoint, stored challenges that expire, and an extra rate-limited round trip, while guarding against almost nothing that MLS signatures and D60 do not already cover |
| B. No proof | Sign-up and login stay as they are | Nothing more to build | The directory can hold keys nobody can use, but only under the account that sent them |

A key the sender does not hold is useless: from M2, every key package and MLS credential is signed with it and checked by every member's app, so such a device can never join a group. Claiming someone else's key is already refused by D60, and a server that lies about keys is caught by safety numbers (D45), not by this check.

Recommendation: B. MLS signatures already prove possession wherever it matters.

Your choice: B, no proof of possession (decided October 14, 2026).

## D62 — Recognising a reused refresh token

Found while planning M1: the Security checklist requires that reusing an old refresh token cancels all of that device's tokens, but the M1 build steps deleted the old token on refresh, so a reused one looked like any wrong value and the server could not tell which device it came from.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Keep used tokens, marked | Refreshing marks the old token as used instead of deleting it; presenting a used token deletes all of that device's tokens and closes its WebSockets; rows are cleaned up after they expire | One extra column makes the checklist item true; theft is noticed whichever side refreshes first | A refresh reply lost in transit logs that device out; logging back in returns the same device (D59) |
| B. Token families | Each login starts a family with a generation number; a stale generation cancels the family | Can tell which login was compromised | More state and logic, with no gain while each device holds one token |
| C. Drop the check | Delete the old token as first written, and drop the requirement | Nothing to build | No sign of a copied token, which unencrypted local storage (D20) makes easy |

Recommendation: A. It is the smallest change that makes reuse detectable.

Your choice: A, keep used tokens marked (decided October 14, 2026).

## D63 — AGPL version: only 3.0, or 3.0 or later

D16 chose AGPL-3.0; the M1 setup left open whether the code is licensed under version 3 only or under version 3 and any later version. It goes in `LICENSE` and every `package.json` from the first commit.

| Option | What it means | Pros | Cons |
| --- | --- | --- | --- |
| A. AGPL-3.0-only | Version 3 exactly | Full control: a future version with terms you dislike cannot apply to your code | Moving to a later version needs every copyright holder's consent once others contribute; incompatible with future "version 4 only" code |
| B. AGPL-3.0-or-later | Version 3, or any later version the Free Software Foundation publishes, at the recipient's choice | The Free Software Foundation's recommended form; stays compatible with future versions without tracking down contributors | Trusts terms not yet written; released code cannot take that permission back |

Every dependency is under a permissive license and fits either option.

Recommendation: B. As a solo maintainer publishing from the first commit, it avoids ever needing every contributor's consent to change versions, and the risk of a later version weakening copyleft is small.

Your choice: B, AGPL-3.0-or-later (decided October 14, 2026).

## D64 — Who can look up the key directory

Found while planning M1: the build steps did not say whether looking up a user's device keys needs a login. Every real use is by a logged-in member: adding someone goes through key-package requests over the WebSocket in M2, and safety numbers (M4) compare keys with fellow members. Open access would let anyone list registered usernames, how many devices each has, and when devices come and go.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Logged-in accounts only | A valid token is required, with a per-account rate limit | Stops anonymous scraping; simple | Anyone can sign up (5 per hour per IP address) and then look up anyone |
| B. Public | No login needed | Anyone can check keys from outside the app | Anonymous listing of usernames and device counts |
| C. A in M1, narrowed in M2 | Logged-in only in M1; from M2, only accounts that share a group with the caller or have a pending invitation with them | Each caller gets only what they need; mirrors presence, which also narrows to group members in M2 | One more rule to build in M2 |

Recommendation: C. It follows the pattern already planned for presence. Sign-up still reveals whether a username is taken, limited to 5 attempts per hour per IP address.

Your choice: C, with lookups limited to 60 per minute per account (decided October 14, 2026).

## D65 — How the app knows its server address

Found while planning M1: the guide fixed the relay's hostnames but never said where the app's backend address comes from, and the Security checklist asks for HTTPS and WSS only from M1 while development runs on plain http on the local machine.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Built in at build time | Each build has one backend address: the local machine in development builds, the production name in release builds; the build fails on an address other than the local machine that is not https or wss | Simplest; matches the relay names and update feed, which are already fixed; HTTPS and WSS only becomes a build-time guarantee; nothing in the interface can point the app at a hostile server | Someone running their own server changes one value and rebuilds |
| B. Chosen by the user | A server field on the login screen, defaulting to yours | Friendly to people running their own servers | Brings in several servers: which server an account belongs to, relay settings per server, wiping data when switching (D60), and tricking people into a hostile server; a lot for version 1 |
| C. Built in, with a hidden override | As A, plus an environment variable or launch option that replaces the address | Testing other servers without rebuilding | Two configuration paths to test; anything that can set the variable can quietly redirect the app, and http must then be refused at run time too |

Recommendation: A. It turns "HTTPS and WSS only" into a property of the build rather than a check to remember, and production TLS is already handled by the router (D53).

Your choice: A, built in at build time (decided October 14, 2026).

## D66 — Cutting off open connections after a password change

Found while planning M1: logging out and reusing a refresh token (D62) close the device's WebSockets at once, but password change and recovery only cancelled refresh tokens, leaving open sockets alive until the 15-minute check. Changing the password is the only way to shut out a stolen device, and from M2 an open socket keeps receiving the groups' new messages.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Close at once | Password change closes the WebSockets of the account's other devices; recovery closes all of them | Consistent with logout and D62; a few lines, since the server already tracks sockets per device | An access token already issued still works for HTTP requests until it expires, at most 15 minutes (D37b) |
| B. Wait for the 15-minute check | As first written | Nothing to add | Up to 15 minutes of live messages for an attacker after the owner reacts |

Recommendation: A. It costs almost nothing and closes the gap exactly when the owner needs it.

Your choice: A, close at once (decided October 14, 2026).

## D67 — Deleting an account

Found while planning M1: no decision or build step covered deleting an account, and it was not on the out-of-scope list either. Doing it properly means removing the account's devices from every group's MLS membership, the same mechanism a lost device needs (pending for M2), and deciding whether the username can be taken again.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Plan it in M2 | Designed together with removing a lost device, once groups exist | Built alongside the mechanism it shares; no M1 work redone | Not available in M1 |
| B. Server-only version in M1 | Deletes the account's server records now | Exists from the start | Half a feature without groups; M2 redoes it |
| C. Not in version 1 | Added to the out-of-scope list | Less to build | People cannot remove their account and its server records themselves |

Recommendation: A. It is expected in a privacy-focused app, and shares its hardest part with removing a lost device.

Your choice: C, not in version 1 (decided October 14, 2026).

## D68 — Automatic checks on pull requests

Found while planning M1: D48 covers release builds in M5, and the rules mention installing with a frozen lockfile in CI, but nothing decided when automatic checks on pull requests begin.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. From M1, on Linux and Windows | Each pull request installs with a frozen lockfile, then lints, typechecks and tests on both systems; `main` requires the checks to pass | Native-module and path problems on either system show up at once; free on a public repository | One workflow to maintain; Windows runs take a few minutes |
| B. From M1, on Linux only | The same checks on Linux | Faster | Windows-only failures, the riskier system for native builds, wait for manual testing |
| C. None until M5 | Only the release workflow from D48 | Nothing to set up now | Nothing automatic checks a pull request before it is merged |

Recommendation: A. The app supports both systems, and native modules are where they differ most.

Your choice: C, none until M5 (decided October 14, 2026). Tests, lint and typecheck run locally before each pull request is merged.

## D69 — Styling the interface

Found while planning M1's desktop screens: D21 chose React, but nothing chose how the interface is styled. It must work with the strict Content Security Policy (only the app's own scripts, no eval), ideally without allowing inline styles in release builds.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Tailwind CSS, through its Vite plugin | The same approach as your other React app; produces a plain CSS file at build time and adds no code that runs in the app; works without inline styles | A build-time dependency; long class lists in the markup |
| B. CSS Modules, built into Vite | No new dependency; plain CSS scoped per component | Slower to build screens; spacing and colours need conventions of their own |
| C. A component library (for example Mantine, MUI or shadcn with Radix) | Ready-made accessible components; fastest to build screens | The most dependencies; libraries that inject styles from JavaScript need inline styles allowed, weakening the policy; the look follows the library |

In development, Vite injects styles inline for live reloading with any option, so only the development build's policy allows inline styles.

Recommendation: A. It is familiar, works only at build time, and keeps the release policy strict.

Your choice: A, Tailwind CSS (decided October 14, 2026).

## D70 — What identifies a device inside MLS

Found while planning M2: each device's MLS credential carries an identity that every group member sees, but the guide did not say what it holds. Members' apps rely on it to check each commit against its declared change (D41), to count people rather than devices for the 10-member limit (D17), and to group a person's device keys for safety numbers (D45).

| Option | Credential identity | Pros | Cons |
| --- | --- | --- | --- |
| A. Username and device ID | The account's username and the device's ID, in one fixed encoding | Apps count people, match declared changes device by device and group keys per person, all from signed MLS state rather than the server | Usernames become permanent; device IDs are visible to group members, as they already are in new-device notices |
| B. Username only | The account's username | Simpler | A person's devices differ only by key, so matching device-level changes relies on keys |
| C. Device ID only | The device's ID | No username inside MLS | Learning whose device it is means asking the server, which D41 exists to distrust |

Recommendation: A. Hard to change later, since credentials live in every group's state, and it keeps every check on the device.

Your choice: A, username and device ID (decided October 14, 2026).

## D71 — What an app does with a commit that breaks the rules

Found while planning M2: the build steps said to reject commits that take a group past 10 people and to warn on a mismatch with the declared change, but an MLS commit cannot be half-applied. A device either moves to the new epoch with everyone else or stays behind and can read nothing after it.

| Option | What the app does | Pros | Cons |
| --- | --- | --- | --- |
| A. Refuse and freeze the group | Does not apply the commit; the group becomes read-only on this device, with a notice naming the sender and what the commit really did | A hidden device never receives a key honest members encrypt with; the dishonest side ends up alone | Destructive: the group must be recreated even when the cause was a bug |
| B. Apply and warn | Applies the commit, stays in step, and shows the same notice | The group keeps working, and people decide what to do | A hidden device reads new messages until someone removes it; the warning comes after the harm |
| C. Depends on the mismatch | Refuses undeclared additions and growth past 10; applies and warns otherwise | Freezes only when secrecy is at stake | Two paths and a rule that must be exactly right |

Recommendation: A. A mismatch only comes from a faulty or dishonest app, and freezing keeps new messages away from anyone not declared.

Your choice: B, apply and warn (decided October 14, 2026). The remaining risk is listed under Risks you accepted.

## D72 — Removing a lost or stolen device

Found while planning M2: changing the password cuts a lost device's sessions (D66), but nothing removes it from groups or the key directory.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. From the account's other devices | A list of your devices; removing one revokes it on the server and removes it from every group | One action does everything | New screens, server revocation and per-group commits |
| B. Group members remove it by hand | A per-group action to remove one device | Little to build | Devices have no names, so telling them apart needs more design |
| C. Not in version 1 | Change the password; if needed, members remove the person and invite them again | Nothing to build | A lost device stays in its groups until someone acts |

Recommendation: A at first; the discussion then moved to B and device names.

Your choice: C, not in version 1 (decided October 14, 2026). The app is for a small group of friends on Windows desktops, so the extra design is not worth it now.

## D73 — Windows only in version 1

Raised while planning M3 to M5: the app will be used by a small group of friends, all on Windows desktop computers. D4 targeted Windows and Linux, which brought Wayland screen sharing, Linux trays (D47), four Linux package formats (D50) and a Linux machine in every milestone gate.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Windows only in version 1 | Removes Wayland, the Linux tray, Linux autostart and Linux packaging; every gate needs only Windows computers | Linux users cannot use version 1; Linux support comes later |
| B. Keep Windows and Linux | Matches D4 | A large share of M3 to M5's work serves nobody who will use version 1 |

Recommendation: A. Nothing in the code makes Linux hard to add later.

Your choice: A, Windows only (decided October 14, 2026). D47 (Linux without a tray) and D50 (Linux formats) move out of version 1. The server still runs on Linux (D52), since that is the hosting machine rather than a desktop app.

## D74 — Keyboard hook for global push-to-talk

Left open by D44b until M3. Electron's own global shortcuts report key presses but not releases, so holding a key to talk needs a low-level keyboard hook in the main process.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. uiohook-napi | A Node-API wrapper around libuiohook, with key-down and key-up events | Maintained; prebuilt Windows binaries; Node-API survives Electron upgrades; small API | A native module with an install script, approved by name; a third-party binary |
| B. node-global-key-listener | A bundled helper program reports keys to the app | No compiling | A separate process to ship; antivirus tools sometimes flag the helper |
| C. Our own hook in Rust | About a hundred lines with napi-rs and the Windows hook API | No third-party binary | The most work; a native build for Electron to maintain |

Recommendation: A. The standard tool for the job, wrapped behind the app's own interface so it can be swapped for C later.

Your choice: A, uiohook-napi (decided October 14, 2026).

## D75 — TypeScript version

Raised during M1 setup (#1). The guide installs `typescript` without a version. The newest release is TypeScript 7 (the native compiler), but `typescript-eslint` (D33), at 8.71.2, supports only TypeScript versions below 6.1.

| Option | Pros | Cons |
| --- | --- | --- |
| A. TypeScript 6.0.x (`~6.0.3`) | Works with `typescript-eslint` today; one compiler for type checking and linting | Not the newest major; a move to 7 later |
| B. TypeScript 7 | The newest release; much faster type checking | Outside `typescript-eslint`'s supported range, so linting with type information breaks |
| C. TypeScript 7 for type checking, 6.0.x under an alias for `typescript-eslint` | Fast type checking and working linting | Two compilers that can disagree; extra setup |

Recommendation: A. Everything works without workarounds; revisit once `typescript-eslint` supports TypeScript 7.

Your choice: A, TypeScript `~6.0.3` in every package (decided October 15, 2026). Move to 7 once `typescript-eslint` supports it.

## D76 — Declaring Vite explicitly

Raised during M1 setup (#1). Vitest 5 lists `vite` as a required peer dependency instead of installing it, so pnpm adds a version on its own that no `package.json` names. electron-vite (D27) also depends on Vite.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Leave Vite implicit | Matches the guide's install command exactly | Vite's version is invisible, floats, and can drift from the version electron-vite uses |
| B. Add `vite` as a root development dependency | Visible and pinned; kept on the same major as the desktop app's Vite | One more dependency to keep up to date |

Recommendation: B.

Your choice: B, `vite` is a root development dependency, kept compatible with electron-vite's Vite (decided October 15, 2026).

## D77 — How strict linting and formatting are

Raised during M1 setup (#1). With no CI before M5 (D68), `pnpm lint` before each pull request is the only automatic gate. The security plugin's recommended rules are warnings, which do not fail the command, and `typescript-eslint`'s default rules do not use type information, so they miss promises that are never awaited. Prettier with default settings would also rewrite every Markdown file in the design guide.

| Question | Options | Recommendation |
| --- | --- | --- |
| Warnings | A. Warnings do not fail lint. B. `eslint . --max-warnings 0`, so any warning fails it | B: there are no warnings today, and security findings would otherwise be easy to miss |
| Type information | A. `recommended`. B. `recommendedTypeChecked` with the project service. C. `strictTypeChecked` | B, plus `@typescript-eslint/explicit-function-return-type`, which enforces the workspace rule that every function declares its return type |
| Markdown | A. Prettier skips Markdown. B. Prettier formats Markdown too | A: the design guide stays as written, with no large reformatting diff |
| React lint plugins | A. Only the React hooks plugin that D33 names. B. Also `eslint-plugin-react-refresh`, which the electron-vite template uses. C. Also `eslint-plugin-react`, which does not support ESLint 10 yet | A: the hooks rules cover the bugs that matter; the template's extra plugins add little |

Your choice: warnings fail lint (`--max-warnings 0`); `recommendedTypeChecked` plus `explicit-function-return-type`; Prettier keeps skipping Markdown; only the React hooks plugin (decided October 15, 2026). Rules are never turned off inline; a false positive is fixed in the code or in the shared configuration.

## D78 — Pinning Electron's version

Raised while adding the desktop app (#1). The template's `postinstall` runs `electron-builder install-app-deps`, which needs Electron's exact version. Under the hoisted layout (`07-m1-setup.md` step 4) electron-builder cannot find Electron inside `apps/desktop/node_modules`, and it refuses a version range such as `^44.7.2`. Packaging in M5 fails the same way.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Pin the exact version in `apps/desktop/package.json` | One line; the fix electron-builder suggests; also fixes packaging | Each Electron upgrade is a deliberate version change |
| B. Keep the range and set `electronVersion` in `electron-builder.yml` | Keeps the range | The version lives in two places that can drift |
| C. Remove `install-app-deps` from `postinstall` | Nothing to pin today | better-sqlite3 in the app (#3) needs it back, and packaging still fails |

Recommendation: A.

Your choice: A, Electron pinned to an exact version, 44.7.2 at the time (decided October 15, 2026).

## D79 — electron-winstaller's install script

Raised while adding the desktop app (#1). electron-builder installs `electron-winstaller` through its optional Squirrel.Windows support, and pnpm 11 stops until its install script is approved or denied. The script only copies a bundled 7-Zip program for the computer's architecture. The app's installer is NSIS, which does not use it.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Deny it (`electron-winstaller: false` in `allowBuilds`) | Nothing runs; NSIS does not need it | None for NSIS builds |
| B. Approve it | Harmless | Runs a script for a tool the app does not use |

Recommendation: A.

Your choice: A, denied (decided October 15, 2026).

## D80 — better-sqlite3's install script

Raised while building M1 (#2, #3). The guide approves better-sqlite3's install script so it can compile. Version 13 ships prebuilt Node-API binaries for Windows, which load in Node.js and, being Node-API, in Electron too, and its `package.json` says it needs no compiling. Approving it anyway makes pnpm compile it from source, which fails on any computer without Visual Studio's C++ tools. A fresh checkout of the repository could not install.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Deny it (`better-sqlite3: false` in `allowBuilds`) | Nothing runs; the prebuilt binary is used; installs work on any Windows computer | If a future version stops shipping prebuilt binaries, this has to be revisited |
| B. Keep it approved and install Visual Studio's C++ tools on every computer | Builds from source | A multi-gigabyte install on every development computer, including the second one for the M1 gate, to compile what is already prebuilt |

Recommendation: A.

Your choice: A, denied (decided October 15, 2026). This replaces the approval in `08-m1-build.md` step 1.

## D81 — A new login replaces the device's refresh tokens

Raised while building M1 (#2). D62 assumes each device holds one refresh token. Logging in again on the same device, for example after a crash, issued a new token without cancelling the old ones, so a device could hold several valid tokens for up to 30 days and keep counting as logged in at the 15-minute check.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Keep the old tokens | Nothing to build | Stray tokens linger for 30 days |
| B. A login deletes that device's other refresh tokens | One token per device, as D62 assumes; one line in the login transaction | Someone with the password and the device's public key could log the real device out, but they could already change the password |

Recommendation: B.

Your choice: B (decided October 15, 2026).

## D82 — Values filled in while building M1

Values the guide did not give, proposed while building M1 and accepted on October 15, 2026.

| Value | Choice |
| --- | --- |
| Response when an identity key already belongs to another account | `409` with the error code `IDENTITY_KEY_TAKEN`, the same status as a taken username; the code tells them apart |
| Where the server's database file lives | The `DATABASE_PATH` environment variable, defaulting to `newcord.db` in the working directory; production sets it explicitly (#14) |
| How the JWT secret's minimum length is measured | At least 32 bytes of the environment variable's text |
| How often expired refresh tokens are deleted | Every 15 minutes, and once at start-up |
| The release build's server address | `https://newcord.duckdns.org`, following the working-title rule (D58), until the final name and deployment (#12, #14) |
| How the desktop app checks IPC arguments | With the shared TypeBox schemas, so `typebox` is a dependency of the desktop app too |
| Key directory response | `{ "identityKeys": [...] }`, oldest device first, with no device IDs; revisited in M2 (#5) if commits need keys matched to devices |
| A username parameter over 100 characters | Fastify's router answers `414` before any check runs; 33 to 100 characters get `400` |
| Unknown query-string fields | Ignored, since no handler reads the query |
| WebSocket Envelope version field and close codes | The field is `v`. `4001` authentication failed or `hello` too late (the app renews its token and reconnects); `4002` session ended (the app shows the login screen); `1008` for any message after `hello` in M1 |
| Types for the WebSocket library | `@types/ws` as a development dependency of the server, so the hub's socket interfaces are checked against `ws` |
| Detecting dead WebSocket connections | A server heartbeat, built in its own follow-up issue (#17) |

## D83 — Where the MLS welcome travels

Raised while building M2 (#5). `06-message-formats.md` listed a separate client `mls.welcome` envelope after the commit that adds devices.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Inside `mls.commit`, as an optional `welcome` field required when the commit adds devices; the server stores the commit at sequence N and the welcome at N+1 in one transaction and delivers the welcome only to the added devices | An added device can never miss its welcome; nothing can arrive before it | Differs from the guide's table |
| B. A separate envelope, as listed | Matches the guide | Messages can arrive before the welcome, and an adder crashing between the two leaves the added device stuck |

Recommendation: A.

Your choice: A (decided October 17, 2026). `06-message-formats.md` is updated to match.

## D84 — Where the relay's addresses come from

Raised while building M3 (#8). The server returns the relay's addresses with each 1-hour password; #8's spec also had the desktop build them in, D65-style.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Only the server's required `RELAY_URLS` setting, returned by `GET /relay/credentials` | One place to change; no new app build when the relay moves | The app learns the relay only once logged in, which calls need anyway |
| B. Built into each app build, the route returning only username and password | No relay setting on the server | Two places to keep in step; every relay change needs a new build |

Recommendation: A.

Your choice: A (decided October 17, 2026).

## D85 — Call messages carry the sender's time

Raised while building M3 (#9). `06-message-formats.md` says `call.join` and `call.leave` carry only their type, but #9's spec ignores call messages more than 60 seconds old by the sender's time, so a device back from offline does not act on old joins and offers.

| Option | Pros | Cons |
| --- | --- | --- |
| A. `call.join`, `call.leave` and `call.signal` carry `sentAt`, the sender's clock in milliseconds, inside MLS | The staleness rule works; the server still sees nothing | One more field than the table listed |
| B. Only the type | Matches the table | A returning device may list people who left long ago, and act on stale offers |

Recommendation: A.

Your choice: A (decided October 17, 2026). `06-message-formats.md` is updated to match.

## D86 — Who is in a call for a device that missed its start

Raised while building M3 (#9). With stale joins ignored (D85), a device that comes online during a call started more than 60 seconds earlier does not know who is in it. Until it joins, its list and the call-full check undercount; once it joins, it learns each participant from their signals.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Participants re-send `call.join` about every 50 seconds while in a call | Accurate lists for everyone | Many more queued MLS messages, also kept up to 30 days for offline devices |
| B. Keep it: a joiner learns from signals | Nothing more to send | A seventh joiner who did not know may briefly connect to some participants |
| C. A new `call.present` payload answering each join | Accurate for joiners | A new payload type |

Recommendation: B, enough for a small group of friends.

Your choice: B (decided October 17, 2026).

## D87 — What switching accounts erases

Raised while building M4 (#10). D60's switch erases every local table, which since M3 and M4 includes this computer's settings (microphone, hotkeys, codec, Hide my IP, previews, start at login, close behaviour) and its one-time flags. After a switch, start at login turned back on and the one-time notices repeated.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Erase everything, as before | The strictest reading of D60 | Settings that belong to the computer reset, and start at login turns on again |
| B. Erase the account's data only: identity, session, groups, messages, MLS state, verified marks; keep the device settings and one-time flags | Accounts still cannot be linked (D60); the computer keeps its setup | Settings chosen under one account carry to the next |

Recommendation: B.

Your choice: B (decided October 17, 2026). This narrows what D60's switch erases.

## D88 — Unblocking someone you share no group with

Raised while building M2 (#6). Blocking and unblocking happen from a group's member list, so a blocked person who no longer shares any group could not be unblocked.

| Option | Pros | Cons |
| --- | --- | --- |
| A. A Blocked list with Unblock buttons in Settings, under Privacy | Every block can be undone | One more small list |
| B. Member lists only | As specified | Such a block lasts forever |

Recommendation: A.

Your choice: A (decided October 17, 2026).

## D89 — How production runs the server

Raised while preparing the deployment (#14). The guide's systemd unit runs `node dist/index.js`, but the server has no build step: it runs TypeScript through tsx, and `@newcord/shared` ships TypeScript source.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Bundle the server into `dist/` | Faster start-up | A bundler such as esbuild runs an install script |
| B. Run through tsx in production (`node --import tsx src/index.ts`, tsx a server dependency) | Nothing new to install; development and production run the same way | tsx compiles at start-up |
| C. Compile the server and the shared package with tsc | No new tool | More build configuration, and the shared package's exports change |

Recommendation: B.

Your choice: B (decided October 17, 2026).

## D90 — MLS module functions beyond the guide's table

Raised while building M2's desktop work (#6) and safety numbers (#11) against an engine port mirroring #4's API.

| Function | Why |
| --- | --- |
| `groupEpoch(groupId)` | Every `mls.commit` carries the epoch it builds on |
| `groupMembers(groupId)` | The member list is read from the MLS state (D70) |
| `groupMemberKeys(groupId)` | Safety numbers read each member's identity key from the credentials, not the server (D45) |
| One past epoch kept readable | Messages sent just before a commit still decrypt after it |

Recommendation: add all four to `@newcord/mls`, each with its own Rust tests.

Your choice: add all four (decided October 17, 2026).

## D91 — Server behaviour added while building M2

Found while building the desktop's groups (#6) against the server (#5); each fixes a case where a device got stuck or a message could never be deleted.

| Change | Why |
| --- | --- |
| A leaving account's devices receive the one commit that removes them (#5's spec said they receive nothing more) | Its other devices learn the group is gone |
| Groups are prompted again when a device uploads key packages | A `device.new` prompt sent before the new device had packages could never succeed |
| A new group is prompted right after `group.create` | The creator's other devices join at once |
| A queued message with no recipients is not stored | It would never be acknowledged or deleted |

Recommendation: keep all four.

Your choice: keep all four (decided October 17, 2026).

## D92 — The app's final name

The name chosen before M5 (D58, #12).

| Option | Pros | Cons |
| --- | --- | --- |
| A. Keep "newcord" | No rename pass; everything already uses it | The DuckDNS names `newcord.duckdns.org` and `newcord-turn.duckdns.org` must be free |
| B. A new name | | A search-and-replace pass before M5 |

Your choice: A, "newcord" is the final name (decided October 17, 2026). The appId stays `com.newcord.desktop`. On October 17, 2026 neither `newcord.duckdns.org` nor `newcord-turn.duckdns.org` resolved in DNS, so both looked unclaimed; they are registered with the machine (#14).

## D93 — uiohook-napi's install script

Raised while building M3's push-to-talk (#9). `uiohook-napi` (D74) is a native module whose install script, `node-gyp-build`, picks the prebuilt binary for the platform and compiles only when none fits; the package ships prebuilt binaries for Windows on x64 and Arm.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Approve it (`uiohook-napi: true` in `allowBuilds`) | Push-to-talk works while a game is in front (D44b) | One more install script runs |
| B. Deny it | Nothing runs | No global push-to-talk |

Recommendation: A.

Your choice: A, approved (decided October 17, 2026). Push-to-talk keys are keyboard keys, stored as `KeyboardEvent.code`; mouse buttons are not offered.

## D94 — The Rust toolchain on Windows

Raised while setting up the MLS module (#4). Rust's default Windows toolchain links with Microsoft's C++ build tools, which this development computer does not have (D80). The GNU toolchain links on its own, but anything built for Windows itself that creates import libraries (getrandom and windows-sys) needs an assembler it does not bundle; the WebAssembly build is not affected.

| Option | Pros | Cons |
| --- | --- | --- |
| A. GNU toolchain; wasm-bindgen-cli's official prebuilt binary from its GitHub release, its SHA-256 checked; the crate's Rust tests compiled to WebAssembly and run in Node by wasm-bindgen-test | Nothing else to install; the tests run on the target the app uses | A downloaded binary instead of one compiled locally; tests cannot use native-only code |
| B. GNU toolchain plus a MinGW-w64 toolchain on PATH | Native Rust tests, and wasm-bindgen-cli compiles from source | Another toolchain to keep |
| C. Visual Studio Build Tools and the MSVC toolchain | Rust's default on Windows | Several gigabytes and an administrator install |

Recommendation: A.

Your choice: A (decided October 17, 2026). The toolchain is stable-x86_64-pc-windows-gnu with the wasm32-unknown-unknown target, and wasm-bindgen-cli 0.2.129 matches the crate's pinned wasm-bindgen.

## D95 — Where the installed app and development runs keep their data

Raised while packaging the app (#13). Electron names the per-user data folder after the package, which the template called "desktop", so the installed app and development runs both used `%APPDATA%\desktop`. The installed app talks to the production server and development runs to a local one, yet they shared one database, identity and session.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Separate folders: the installed app in `%APPDATA%\newcord`, development runs in `%APPDATA%\newcord-dev` | The two never mix sessions or identities; the folder carries the app's name | Development data in `%APPDATA%\desktop` is left behind, and development runs start fresh |
| B. Both in `%APPDATA%\newcord` | One folder to know about | Development and installed copies share one session and identity |
| C. Leave both in `%APPDATA%\desktop` | No change | The folder does not carry the app's name, and the copies still share data |

Recommendation: A.

Your choice: A (decided October 17, 2026). The main process sets the folder before anything opens it, including the single-instance lock; the old `%APPDATA%\desktop` folder is not touched. To try two Accounts on one computer, a development run given `NEWCORD_DEV_PROFILE` from 2 to 9 keeps its data in `%APPDATA%\newcord-dev-<n>`, which also gives it its own single-instance lock (`pnpm --filter desktop dev:second`, added October 17, 2026 at your request); the installed app ignores the variable.

## D96 — How a tagged release goes out

Raised while writing the release workflow (#13). electron-builder creates a GitHub release as a draft unless told otherwise, and installed apps see only published releases.

| Option | Pros | Cons |
| --- | --- | --- |
| A. A draft that you check (its files and SHA-256 list) and publish by hand | A bad or tampered build never reaches installed apps without a human look (D29b) | One click per release |
| B. Published as soon as the tag is pushed | Fully automatic | Nothing stands between the CI build and every installed app |

Recommendation: A.

Your choice: A (decided October 17, 2026). `electron-builder.yml` sets `releaseType: draft`, and the workflow adds the SHA-256 list to the draft's notes.

## D97 — When the window offers "restart to update"

Raised while adding automatic updates (#13). The guide offers "restart to update" once a call ends (12-m5-build step 7); an update downloaded outside a call would wait for the next quit, and the app lives in the tray and starts with Windows (D42, D46), so it may not quit for days.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Also offer it as soon as an update is downloaded outside a call; the offer hides during a call and comes back when the call ends | Updates install sooner; still never a restart during a call | A banner may appear while you are chatting |
| B. Only when a call ends with an update waiting | Exactly the guide's wording | Updates may wait days for a quit or a Windows restart |

Recommendation: A.

Your choice: A (decided October 17, 2026).

## D98 — The installer's publisher and description

Raised while packaging the app (#13). The installer shows the desktop package's author as the publisher in Windows' list of installed apps, and its description in the program's details; both still held the template's "example.com" and "An Electron application with React and TypeScript".

| Option | Pros | Cons |
| --- | --- | --- |
| A. "newcord" as the author, and a one-line description of the app | Neutral; no personal name or address in every installer | None |
| B. Your name as the author | Says who makes it | Your name is embedded in every installer |

Recommendation: A.

Your choice: A (decided October 17, 2026). The author is "newcord" and the description "A small, security-focused chat and call app for groups of friends"; the template's homepage, electron-vite's site, is removed.

## D99 — Automatic checks on pull requests from M5

Raised once M5 began: D68 put automatic checks off until M5, where only the release workflow existed (D48). Until now every check ran by hand before each merge.

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Windows and Linux Arm | Each pull request to `main` and each push to `main` installs with a frozen lockfile, builds the MLS module, then runs the Rust and Vitest tests, lint, typecheck, Prettier and the desktop build, on Windows and on Linux Arm | Each problem shows on the platform it would hit: Windows for the app (D73), Linux Arm for the Oracle server (#14); free on a public repository | Windows runs take several minutes, mostly compiling the MLS module |
| B. Windows only | The same checks on Windows, the release workflow's runner | One system to keep | Linux-only server problems show only when deploying |
| C. Linux only | The same checks on Linux | The fastest runs | Windows-only problems on the app's only platform wait for hand testing |

Recommendation: A.

Your choice: A (decided October 17, 2026). `.github/workflows/checks.yml` runs on `windows-latest` and `ubuntu-24.04-arm`, with every action pinned to a full commit hash and read-only access; the wasm-bindgen CLI and the MLS crate's build are cached between runs.

## D100 — The WebSocket heartbeat

Raised as a follow-up from #2 (#17). The server noticed a socket was gone only when TCP did, so a laptop that slept or lost its network stayed "online" for everyone else until the connection timed out: up to an hour behind nginx's `proxy_read_timeout` in production (#14).

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Every 30 seconds, ended after one missed reply | The server pings each authenticated socket; one that has not answered by the next ping is terminated | A dead Device goes offline within about a minute; the pings also keep nginx's connection busy | None worth noting: a ping is a few bytes |
| B. Every 15 seconds, ended after one missed reply | The same, twice as often | Offline within about 30 seconds | More sensitive to a brief network hiccup |
| C. Every 60 seconds, ended after two missed replies | Fewer pings, more tolerance | The fewest pings | The online list stays wrong for 2 to 3 minutes |

Recommendation: A.

Your choice: A (decided October 17, 2026). Browsers, Electron and Node's built-in WebSocket answer pings on their own, so the desktop app needs no change; a terminated socket closes as usual, so presence sends "offline" and the app reconnects when it can.

