# M1 build steps


These steps add M1's features on top of the setup: accounts, login, tokens, the WebSocket and the key directory. M1 is done when two clients sign up, log in and see each other online.

## Settings

Proposed by me and accepted by you on October 14, 2026.

| Setting | Proposed | Why |
| --- | --- | --- |
| Access token lifetime | 15 minutes | Short enough that a stolen token stops working quickly (D37b) |
| Refresh token lifetime | 30 days, replaced each time it is used | Matches the 30-day message wait (D24); replacing it on use means a copied old token gets noticed |
| Argon2id cost | 19 MiB of memory, 2 iterations, 1 thread | The minimum OWASP recommends ([source](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)) |
| Minimum password length | 12 characters | Hard to guess, still easy to accept |
| Username rules | 3 to 32 characters: lowercase letters, digits, underscore | Easy to type when adding people (D13); no look-alike characters |
| Login rate limit | 5 attempts per minute, per username and per IP address | Slows down password guessing |
| Local database in the app | better-sqlite3, as on the server (D34) | One library to learn; it must be rebuilt for Electron's Node.js version |
| WebSocket hello deadline | 5 seconds | Enough for a real app on a slow link; short enough that idle sockets cannot pile up |
| Sign-up rate limit | 5 per hour per IP address | Each sign-up costs an Argon2id hash; limits resource use and mass account creation |
| Refresh rate limit | 20 per minute per IP address | A healthy device refreshes about every 14 minutes; tokens cannot be guessed, so this only stops floods, with room for shared addresses |
| Password recovery rate limit | 5 per hour, per username and per IP address | Recovery codes cannot be guessed, but each attempt costs an Argon2id check |
| Password change rate limit | 5 per hour per account | Each change costs an Argon2id hash, and D55 lets a stolen session change the password without the old one |
| Largest HTTP request body | 64 KiB | Sign-up and login are under 1 KiB; M2's key-package upload is about 15 KiB |
| Largest WebSocket message | 64 KiB, measured again in M2 | M1 envelopes are tiny; M2's commits and welcomes for 10 members need measuring first |
| Key directory rate limit | 60 lookups per minute per account | Far above what adding people and checking safety numbers need; slows scraping by a signed-up account (D64) |
| JWT renewal | 1 minute before it expires | Allows for clock differences and a slow reply |
| Recovery code alphabet | Crockford Base32: digits and capital letters without I, L, O and U; input ignores case and dashes, and reads O as 0 and I or L as 1 | Exactly 32 symbols, so 24 characters give the 120 bits specified; a published alphabet made for codes typed by hand |

## Server

1. Add the server libraries, plus TypeBox for the shared package ([source](https://fastify.dev/docs/latest/Reference/Type-Providers/)). Then approve better-sqlite3 and argon2 when pnpm asks, since both compile native code:

```bash
pnpm --filter server add better-sqlite3 argon2 @fastify/jwt @fastify/rate-limit typebox @fastify/type-provider-typebox
pnpm --filter server add -D @types/better-sqlite3
pnpm --filter @your-app/shared add typebox
pnpm approve-builds
```

2. Create the tables. Refresh tokens are stored only as a SHA-256 hash and kept, marked as used, until they expire, so a reused one can be recognised (D62); each device's identity key is its Ed25519 public key, a device's ID is a random value created by the server (D59), and an identity key can belong to only one account (D60):

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  identity_key BLOB NOT NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE (identity_key)
);

CREATE TABLE refresh_tokens (
  token_hash BLOB PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES devices(id),
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
```

3. Define each request once in the shared package, so the server validates it and the app is typed from the same definition:

```ts
import { Type } from "typebox";

export const Username = Type.String({ minLength: 3, maxLength: 32, pattern: "^[a-z0-9_]+$" });

export const RegisterRequest = Type.Object({
  username: Username,
  password: Type.String({ minLength: 12, maxLength: 256 }),
  identityKey: Type.String(), // the device's Ed25519 public key, base64 (D30)
});
```

4. Add the routes:

| Route | What it does |
| --- | --- |
| POST /register | Validates the request, checks the username is free, hashes the password with Argon2id, creates the user and this device, and returns tokens, the device's ID and a recovery code to show once (D55) |
| POST /login | Rate-limited; takes the username, password and the device's identity key; checks the password, finds the device by account and identity key or creates it the first time it logs in (D59), rejects a key already registered to another account (D60), returns tokens and the device's ID |
| POST /refresh | Swaps a valid refresh token for a new JWT and a new refresh token, marking the old one as used; presenting a used token deletes all of that device's refresh tokens and closes its WebSockets (D62). Used and expired rows are cleaned up after they expire |
| POST /logout | Deletes the device's refresh token and closes its open WebSockets |
| POST /password/change | From a logged-in device: sets a new password without needing the old one (D55), then cancels the refresh tokens of the account's other devices and closes their WebSockets (D66) |
| POST /password/recover | Rate-limited; takes the username, the recovery code and a new password, cancels every refresh token, closes every WebSocket of the account (D66), and returns a new recovery code to show once |
| GET /users/:username/keys | The key directory: logged-in accounts only, rate-limited; returns the identity keys of that user's devices (D64) |

The recovery code is stored only as an Argon2id hash. Format, accepted on October 14, 2026: 24 characters from Crockford Base32, an alphabet without look-alike characters (see Settings), shown in groups of four, giving about 120 bits of randomness.

5. Add the WebSocket at /ws:

- The first message must be a hello envelope carrying the JWT, sent within 5 seconds, or the server closes the connection. The token goes in a message rather than the URL because URLs end up in logs.
- After hello, the server marks the device online and sends presence updates. M1 has no groups yet, so presence goes to every connected client; M2 narrows it to group members.
- A socket outlives its 15-minute JWT, so every 15 minutes the server checks that the device still has a refresh token and closes the socket if it does not. Logout closes it immediately.

## Desktop app

6. Keep keys and tokens away from the interface. Check that the template's window settings keep context isolation and the sandbox on and Node.js access off in the interface. All network calls, keys and tokens live in Electron's main process; the interface asks for actions through a small preload API. The backend address is built into the app (D65): `http://localhost:3000` in development builds and the production `https` and `wss` address in release builds, and the build fails if an address other than the local machine is not `https` or `wss`.
7. On first start, create the device's Ed25519 identity key with Node.js's built-in crypto, and store it with the tokens and the account's username in the local database (unencrypted, D20). An installation belongs to one account at a time (D60): logging back in to the same account reuses the key, while logging in to a different account first warns that this erases the app's local data, then wipes the local database and creates a new key:

```ts
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
```

In M2, OpenMLS signs with this same key: its basic credential can be rebuilt from an existing Ed25519 key pair's raw bytes ([source](https://docs.rs/openmls_basic_credential/0.5.0/aarch64-unknown-linux-gnu/struct.SignatureKeyPair.html)).

8. Add better-sqlite3 to the app, and rebuild native modules for Electron by adding `"postinstall": "electron-builder install-app-deps"` to the desktop app's scripts ([source](https://github.com/codaline-io/electron-builder)):

```bash
pnpm --filter desktop add better-sqlite3
```

9. Build the screens: sign-up, a one-time recovery-code screen, login, change password, password recovery, an "online now" list and the warning shown before logging in to a different account (D60). The main process renews the JWT 1 minute before it expires.

## Tests

- Register, login, refresh and logout against an in-memory database (`new Database(":memory:")`)
- Rejections: bad usernames, short passwords, wrong passwords, the sixth login attempt within a minute, and an identity key already registered to another account
- Logging out and back in to the same account keeps the same device; logging in to a different account creates a new key and a new device
- Password change from a logged-in device, and recovery with the code; a used code stops working
- WebSocket: hello with a valid, an expired and a forged token; logout closes the socket
- Reusing an old refresh token logs the device out and closes its socket (D62)
- Password change closes the other devices' sockets, and recovery closes all of them (D66)

## Done when

Two copies of the app on two computers, ideally one Windows and one Linux, sign up, log in and see each other online, and logging one out removes it from the other's list.
