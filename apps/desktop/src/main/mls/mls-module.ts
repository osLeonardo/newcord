import type { MlsEngine } from "./mls-engine";

/**
 * The factory of the MLS engine from `@newcord/mls`, loaded only in the main process. #4 builds
 * the module (Rust compiled to WebAssembly); until then there is no engine and Groups are off.
 * @example const createEngine = loadMlsEngineFactory();
 */
export function loadMlsEngineFactory(): (() => MlsEngine) | undefined {
  return undefined;
}
