import { ciphersuite, MlsDevice, moduleVersion } from "@newcord/mls";
import type { MlsEngine } from "./mls-engine";

/**
 * The factory of the MLS engine from `@newcord/mls` (#4): OpenMLS compiled to WebAssembly, loaded
 * only in the main process so keys never reach the interface (D22). Each engine is one Device.
 * @example const createEngine = loadMlsEngineFactory();
 */
export function loadMlsEngineFactory(): () => MlsEngine {
  return () => new MlsDevice();
}

/**
 * A start-up line naming the module's build, with no key material in it.
 * @example console.log(describeMlsModule()) // "MLS module 0.1.0 loaded, cipher suite 1"
 */
export function describeMlsModule(): string {
  return `MLS module ${moduleVersion()} loaded, cipher suite ${ciphersuite()}`;
}
