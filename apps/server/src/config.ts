/** The JWT secret must hold at least 32 random bytes (13-security-checklist). */
export const MIN_JWT_SECRET_BYTES = 32;

const DEFAULT_DATABASE_PATH = "newcord.db";
const SECRET_REQUIREMENT = `at least ${MIN_JWT_SECRET_BYTES} random bytes, for example the output of "openssl rand -base64 48"`;

export interface ServerConfig {
  jwtSecret: string;
  databasePath: string;
}

/**
 * Reads the server's settings from the environment, refusing a missing or short JWT secret.
 * Example: `const config = loadServerConfig(process.env);`
 */
export function loadServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  return {
    jwtSecret: readJwtSecret(env.JWT_SECRET),
    databasePath: env.DATABASE_PATH || DEFAULT_DATABASE_PATH,
  };
}

function readJwtSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error(`JWT_SECRET is missing; set it to ${SECRET_REQUIREMENT}`);
  }
  const length = Buffer.byteLength(secret, "utf8");
  if (length < MIN_JWT_SECRET_BYTES) {
    throw new Error(
      `JWT_SECRET is ${length} bytes long; it must be ${SECRET_REQUIREMENT}`,
    );
  }
  return secret;
}
