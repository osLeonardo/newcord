import type { IdentityKeyPair } from "../identity/identity-key";
import type { MlsStateStore } from "../local-store/mls-state-store";
import type { MlsEngine } from "./mls-engine";

/** The Device the MLS identity is built for: its M1 key, its Account's username and its ID (D70). */
export interface MlsDevice {
  readonly keyPair: IdentityKeyPair;
  readonly username: string;
  readonly deviceId: string;
}

export interface MlsSessionDependencies {
  readonly stateStore: Pick<MlsStateStore, "read" | "save">;
  readonly createEngine: () => MlsEngine;
  readonly device: MlsDevice;
}

/** The only way to the MLS engine: every operation's new state is saved before anything is sent (D39). */
export interface MlsSession {
  /** Runs an operation and saves the new state blob; throws, sending nothing, if saving fails. */
  run<Result>(operation: (engine: MlsEngine) => Result): Result;
  /**
   * Runs an operation, saves the state, and only then hands the result to `send`.
   * @example await mls.runThenSend((engine) => engine.encrypt(groupId, plaintext), (message) => hub.request(...));
   */
  runThenSend<Result, Sent>(
    operation: (engine: MlsEngine) => Result,
    send: (result: Result) => Promise<Sent>,
  ): Promise<Sent>;
  /** Reads the engine without changing its state. */
  read<Result>(query: (engine: MlsEngine) => Result): Result;
}

/**
 * Opens the Device's MLS session: restores the stored state, or on the first start builds the
 * identity from the M1 key and stores it (#6, Step 01).
 * @example const mls = openMlsSession({ stateStore, createEngine, device });
 */
export function openMlsSession(
  dependencies: MlsSessionDependencies,
): MlsSession {
  const engine = dependencies.createEngine();
  const { stateStore, device } = dependencies;
  const storedState = stateStore.read();
  if (storedState === undefined) {
    engine.initIdentity(
      device.keyPair.privateKey,
      device.keyPair.publicKey,
      device.username,
      device.deviceId,
    );
    stateStore.save(engine.saveState());
  } else {
    engine.loadState(storedState);
  }
  return createSession(engine, stateStore);
}

function createSession(
  engine: MlsEngine,
  stateStore: Pick<MlsStateStore, "save">,
): MlsSession {
  const run = <Result>(operation: (engine: MlsEngine) => Result): Result => {
    const result = operation(engine);
    stateStore.save(engine.saveState());
    return result;
  };
  return {
    run,
    runThenSend: async <Result, Sent>(
      operation: (engine: MlsEngine) => Result,
      send: (result: Result) => Promise<Sent>,
    ): Promise<Sent> => send(run(operation)),
    read: <Result>(query: (engine: MlsEngine) => Result): Result =>
      query(engine),
  };
}
