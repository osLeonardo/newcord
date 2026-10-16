import type { RelaySettings } from "./relay/relay-credentials.js";

/** The JWT secret must hold at least 32 random bytes (13-security-checklist). */
export const MIN_JWT_SECRET_BYTES = 32;

/** The secret shared with coturn must hold at least 32 random bytes too (#8's spec). */
export const MIN_RELAY_SECRET_BYTES = 32;

const DEFAULT_DATABASE_PATH = "newcord.db";
const RELAY_URL_PATTERN = /^(stun|turn|turns):\S+$/;

export interface ServerConfig {
  jwtSecret: string;
  databasePath: string;
  relay: RelaySettings;
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
  };
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
