# M2 build steps


M2 adds encrypted group chat: OpenMLS running as WebAssembly inside the app, named groups of up to 10 people, invitations by username and the server's message queue. M2 is done when a member who was offline gets every message later, the server holds only ciphertext, and a removed member cannot read anything sent afterwards.

## Settings

Proposed by me and accepted by you on October 14, 2026.

| Setting | Proposed | Why |
| --- | --- | --- |
| WebAssembly build tool | wasm-bindgen's command-line tool, targeting Node.js | Actively maintained in its own organization ([source](https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org)); Electron's main process runs Node.js |
| OpenMLS crypto provider | openmls\_rust\_crypto | Pure Rust, so it builds for WebAssembly, and it covers suite 1 (D38) |
| Key packages per device | 20, topped up when fewer than 5 remain, plus one last-resort package | People can add the device while it is offline, and an add never fails for lack of packages |
| Group ID | 16 random bytes chosen by the creator | Unguessable |
| Group name | 1 to 64 characters | Fits the interface; remember the server can read it (D40) |
| What the 10-member limit counts | People, not devices | Someone with two computers still counts once |

## Rust and WebAssembly

1. Install the WebAssembly target and wasm-bindgen's command-line tool. The tool's version must exactly match the wasm-bindgen crate version in the project:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
```

2. Create the Rust crate inside the repository:

```bash
cargo new --lib packages/mls
```

In its `Cargo.toml`, set `crate-type = ["cdylib"]` and add openmls, openmls\_rust\_crypto, openmls\_basic\_credential, openmls\_memory\_storage and wasm-bindgen, using the companion versions that the openmls crate itself depends on ([source](https://docs.rs/openmls/latest/openmls/)). For WebAssembly, also enable the browser-and-Node randomness feature of the getrandom crate (named `js` in version 0.2 and `wasm_js` in 0.3).

3. Expose a small API with wasm-bindgen:

| Function | What it does |
| --- | --- |
| loadState, saveState | Restore and export the whole MLS state as one blob (D39) |
| initIdentity | Rebuilds the signature key from M1's Ed25519 key and creates the device's credential, whose identity is the account's username and the device's ID (D70) |
| createKeyPackages | Creates key packages to upload |
| createGroup | Starts a group with this device as its only member |
| addMembers, removeMembers | Return a commit, plus a welcome when adding |
| joinFromWelcome | Joins a group from a welcome |
| encrypt | Turns plaintext into an MLS message |
| processIncoming | Applies a commit or decrypts a message |
| mergePendingCommit, clearPendingCommit | Finalize your own commit once the server accepts it, or drop it if the server rejects it |

4. Build it for Node.js:

```bash
cargo build --manifest-path packages/mls/Cargo.toml --target wasm32-unknown-unknown --release
wasm-bindgen packages/mls/target/wasm32-unknown-unknown/release/mls.wasm --target nodejs --out-dir packages/mls/pkg
```

5. Load the module only in Electron's main process, never in the interface.

## Server

6. Add the group tables:

```sql
CREATE TABLE groups (
  id         BLOB PRIMARY KEY,
  name       TEXT NOT NULL,
  epoch      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE group_members (
  group_id  BLOB NOT NULL REFERENCES groups(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  PRIMARY KEY (group_id, device_id)
);

CREATE TABLE invitations (
  id         TEXT PRIMARY KEY,
  group_id   BLOB NOT NULL REFERENCES groups(id),
  from_user  INTEGER NOT NULL REFERENCES users(id),
  to_user    INTEGER NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE key_packages (
  id          INTEGER PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id),
  data        BLOB NOT NULL,
  last_resort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  group_id   BLOB NOT NULL REFERENCES groups(id),
  seq        INTEGER NOT NULL,
  sender     TEXT NOT NULL REFERENCES devices(id),
  kind       TEXT NOT NULL,
  payload    BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, seq)
);

CREATE TABLE deliveries (
  group_id  BLOB NOT NULL,
  seq       INTEGER NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(id),
  PRIMARY KEY (group_id, seq, device_id)
);
```

7. Handle the envelopes from the Message formats section:

- group.create stores the group with its name and makes the creator's device its first member.
- mls.commit is accepted only if its declared epoch matches the group's current epoch and the declared change keeps the group at 10 people or fewer. An accepted commit gets the next sequence number, raises the epoch, updates group\_members and is queued for every member device, including any being removed. A rejected sender processes the winning commit and retries.
- mls.message and mls.welcome are queued: one row in messages, one row in deliveries per recipient device, pushed at once to devices that are online.
- ack deletes that device's delivery row; a message is deleted once no delivery rows remain.
- keypackage.get hands out each key package once and deletes it, except the last-resort one.
- Presence now goes only to members of the groups a device shares.
- The key directory now answers only about accounts that share a group with the caller or have a pending invitation with them, either way (D64).
- A user's new device triggers device.new to the members of their groups; the first member app online adds it to each group with one of the device's key packages (D56).
- mls.proposal with a leave request stops delivery to the leaver at once; the next member online commits the removal (D57).
- block and unblock update a blocks table of who blocks whom; invitations from a blocked person are dropped without telling them, and the app keeps its own list to hide that person's messages in shared groups (D57).

8. Run an hourly cleanup. It deletes deliveries older than 30 days (D24), and when one of them was a commit, it sends resync to the group's online members so one of their apps re-adds that device.

## Desktop app

9. On first start after updating, call initIdentity with the key from M1, create 20 key packages and upload them, and top them up whenever the server reports fewer than 5.
10. After every MLS operation, call saveState and write the blob to the local database before sending anything to the server. Turn on SQLite's secure\_delete setting for that database, so the old state's keys are really erased.
11. Check every commit received against the change its sender declared and against the 10-person limit. A commit that fails either check is still applied, so this device stays in step with the group, and the app shows a notice in the group naming the sender and what the commit really did (D71).
12. Build the screens: group list, create group, group chat, invite by username, accept or decline an invitation, remove a member, leave a group, and block or unblock someone. Show a notice in each shared group when a member adds a new device.

## Tests

- MLS flows with two and three devices, both in Rust tests and through the WebAssembly module in Vitest: create, add, chat, remove, and confirm the removed device cannot decrypt anything newer
- Two commits for the same epoch: the first wins and the second is rejected
- Offline delivery: messages queued for an offline device arrive on reconnect and disappear from the server after the ack
- Expiry, with a simulated clock: a commit undelivered for 30 days triggers resync, and the device is re-added
- A declared change that does not match its commit is detected
- The server's database contains no readable message text
- A second device is added to every group automatically and sees only messages sent after it joined
- A member who leaves stops receiving at once and is removed by the next member online
- Invitations from a blocked person never arrive, and their messages are hidden in shared groups

## Done when

Three people share a group. One goes offline while the others chat, and receives everything on return. The server's database holds only ciphertext and group names. After someone is removed, they cannot read anything sent afterwards.
