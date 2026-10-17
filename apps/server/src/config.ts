import { isIP } from "node:net";
import type { RelaySettings } from "./relay/relay-credentials.js";

/** The JWT secret must hold at least 32 random bytes (13-security-checklist). */
export const MIN_JWT_SECRET_BYTES = 32;

/** The secret shared with coturn must hold at least 32 random bytes too (#8's spec). */
export const MIN_RELAY_SECRET_BYTES = 32;

const DEFAULT_DATABASE_PATH = "newcord.db";
/** Development listens on this computer only; production sets 127.0.0.1 behind nginx (#14). */
const DEFAULT_LISTEN_HOST = "localhost";
const RELAY_URL_PATTERN = /^(stun|turn|turns):\S+$/;

export interface ServerConfig {
  jwtSecret: string;
  databasePath: string;
  relay: RelaySettings;
  /** Where the server listens, on port 3000. */
  listenHost: string;
  /** The proxy whose client-address header is believed, nginx's 127.0.0.1 in production (14-server-deployment step 5). */
  trustProxy: string | undefined;
}

/**
 * Reads the server's settings from the environment, refusing a missing or short secret and
 * missing or malformed relay addresses.
 * Example: `const config = loadServerConfig(process.env);`
 */
export function loadServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  return {
    jwtSecret: readSecret("JWT_SECRET", env.JWT_SECRET, MIN_JWT_SECRET_BYTES),
    databasePath: env.DATABASE_PATH || DEFAULT_DATABASE_PATH,
    relay: {
      secret: readSecret(
        "RELAY_SECRET",
        env.RELAY_SECRET,
        MIN_RELAY_SECRET_BYTES,
      ),
      urls: readRelayUrls(env.RELAY_URLS),
    },
    listenHost: env.LISTEN_HOST || DEFAULT_LISTEN_HOST,
    trustProxy: readTrustProxy(env.TRUST_PROXY),
  };
}

function readTrustProxy(address: string | undefined): string | undefined {
  if (!address) return undefined;
  if (isIP(address) === 0) {
    throw new Error(
      `TRUST_PROXY is "${address}"; set it to the proxy's IP address, such as 127.0.0.1 for nginx on the same machine, or leave it empty`,
    );
  }
  return address;
}

function readSecret(
  name: string,
  secret: string | undefined,
  minBytes: number,
): string {
  const requirement = `at least ${minBytes} random bytes, for example the output of "openssl rand -base64 48"`;
  if (!secret) {
    throw new Error(`${name} is missing; set it to ${requirement}`);
  }
  const length = Buffer.byteLength(secret, "utf8");
  if (length < minBytes) {
    throw new Error(
      `${name} is ${length} bytes long; it must be ${requirement}`,
    );
  }
  return secret;
}

function readRelayUrls(urls: string | undefined): string[] {
  const example = '"stun:192.168.1.10:3478,turn:192.168.1.10:3478"';
  if (!urls) {
    throw new Error(
      `RELAY_URLS is missing; set it to the relay's stun:, turn: and turns: addresses separated by commas, for example ${example}`,
    );
  }
  const list = urls.split(",").map((url) => url.trim());
  const malformed = list.find((url) => !RELAY_URL_PATTERN.test(url));
  if (malformed !== undefined) {
    throw new Error(
      `RELAY_URLS has "${malformed}"; each address must start with stun:, turn: or turns:, for example ${example}`,
    );
  }
  return list;
}
