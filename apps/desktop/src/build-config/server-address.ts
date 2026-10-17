export interface ServerAddressesByBuild {
  readonly development: string;
  readonly release: string;
}

/** The backend address built into each kind of build (D65). */
export const builtInServerAddresses: ServerAddressesByBuild = {
  development: "http://localhost:3000",
  release: "https://newcord.duckdns.org",
};

const secureProtocols = new Set(["https:", "wss:"]);
const localOnlyProtocols = new Set(["http:", "ws:"]);
const localMachineHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether D65 allows a build to contain this address: https or wss anywhere, http or ws only to the local machine.
 * @example isAllowedServerAddress("http://localhost:3000") // true
 */
export function isAllowedServerAddress(address: string): boolean {
  if (!URL.canParse(address)) return false;
  const { protocol, hostname } = new URL(address);
  if (secureProtocols.has(protocol)) return true;
  return (
    localOnlyProtocols.has(protocol) && localMachineHostnames.has(hostname)
  );
}

/**
 * Returns the address if D65 allows it, and throws otherwise so the build fails.
 * @example checkServerAddress("https://newcord.duckdns.org") // "https://newcord.duckdns.org"
 */
export function checkServerAddress(address: string): string {
  if (isAllowedServerAddress(address)) return address;
  throw new Error(
    `Server address "${address}" is not allowed in a build (D65): expected an https:// or wss:// address, or http:// or ws:// to the local machine (localhost, 127.0.0.1 or [::1])`,
  );
}

/**
 * Picks the address for an electron-vite mode: development builds use the local server, every other mode is a release.
 * @example serverAddressForMode("production", builtInServerAddresses) // "https://newcord.duckdns.org"
 */
export function serverAddressForMode(
  mode: string,
  addresses: ServerAddressesByBuild,
): string {
  return mode === "development" ? addresses.development : addresses.release;
}
