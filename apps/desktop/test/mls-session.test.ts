import Database from "better-sqlite3";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { createIdentityKeyPair } from "../src/main/identity/identity-key";
import { createSqliteLocalStore } from "../src/main/local-store/local-store";
import {
  createMlsStateStore,
  type MlsStateStore,
} from "../src/main/local-store/mls-state-store";
import type { MlsEngine } from "../src/main/mls/mls-engine";
import { openMlsSession, type MlsDevice } from "../src/main/mls/mls-session";
import { createFakeMlsEngine } from "./support/fake-mls-engine";

const device: MlsDevice = {
  keyPair: createIdentityKeyPair(),
  username: "alice",
  deviceId: "mJMEbgts33NWbvGmNqkuEw",
};
const groupId = new Uint8Array(16).fill(7);

let database: Database.Database;
let stateStore: MlsStateStore;

beforeEach(() => {
  database = new Database(":memory:");
  createSqliteLocalStore(database);
  stateStore = createMlsStateStore(database);
});

afterEach(() => {
  database.close();
});

function spiedEngine(): {
  engine: MlsEngine;
  initIdentity: Mock<MlsEngine["initIdentity"]>;
  loadState: Mock<MlsEngine["loadState"]>;
} {
  const engine = createFakeMlsEngine();
  return {
    engine,
    initIdentity: vi.spyOn(engine, "initIdentity"),
    loadState: vi.spyOn(engine, "loadState"),
  };
}

describe("openMlsSession", () => {
  it("builds the identity from the M1 key on the first start and stores the state", () => {
    const { engine, initIdentity } = spiedEngine();

    openMlsSession({ stateStore, createEngine: () => engine, device });

    expect(initIdentity).toHaveBeenCalledExactlyOnceWith(
      device.keyPair.privateKey,
      device.keyPair.publicKey,
      "alice",
      device.deviceId,
    );
    expect(stateStore.read()).toBeDefined();
  });

  it("restores the stored state on later starts instead of building a new identity", () => {
    openMlsSession({
      stateStore,
      createEngine: createFakeMlsEngine,
      device,
    }).run((engine) => engine.createGroup(groupId));
    const { engine, initIdentity, loadState } = spiedEngine();

    const mls = openMlsSession({
      stateStore,
      createEngine: () => engine,
      device,
    });

    expect(initIdentity).not.toHaveBeenCalled();
    expect(loadState).toHaveBeenCalledOnce();
    expect(mls.read((restored) => restored.groupEpoch(groupId))).toBe(0);
  });

  it("starts a fresh identity after the local store was erased (D60)", () => {
    openMlsSession({ stateStore, createEngine: createFakeMlsEngine, device });
    createSqliteLocalStore(database).eraseAccountData();
    const { engine, initIdentity } = spiedEngine();

    openMlsSession({ stateStore, createEngine: () => engine, device });

    expect(initIdentity).toHaveBeenCalledOnce();
  });

  it("keeps the local database's secure_delete on", () => {
    expect(database.pragma("secure_delete", { simple: true })).toBe(1);
  });
});

describe("MlsSession", () => {
  it("saves the state after each operation", () => {
    const mls = openMlsSession({
      stateStore,
      createEngine: createFakeMlsEngine,
      device,
    });

    mls.run((engine) => engine.createGroup(groupId));

    const restored = createFakeMlsEngine();
    const state = stateStore.read();
    if (state === undefined) throw new Error("no state saved");
    restored.loadState(state);
    expect(restored.groupMembers(groupId)).toEqual([
      `alice:${device.deviceId}`,
    ]);
  });

  it("sends nothing when saving the state fails", async () => {
    const mls = openMlsSession({
      stateStore: {
        read: () => stateStore.read(),
        save: (state): void => {
          if (stateStore.read() !== undefined) throw new Error("disk full");
          stateStore.save(state);
        },
      },
      createEngine: createFakeMlsEngine,
      device,
    });
    const send = vi.fn(() => Promise.resolve("sent"));

    await expect(
      mls.runThenSend((engine) => engine.createGroup(groupId), send),
    ).rejects.toThrow("disk full");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the operation's result once the state is saved", async () => {
    const mls = openMlsSession({
      stateStore,
      createEngine: createFakeMlsEngine,
      device,
    });
    mls.run((engine) => engine.createGroup(groupId));
    const send = vi.fn((message: Uint8Array) => {
      expect(stateStore.read()).toBeDefined();
      return Promise.resolve(message.length);
    });

    await expect(
      mls.runThenSend(
        (engine) => engine.encrypt(groupId, new Uint8Array([1])),
        send,
      ),
    ).resolves.toBeGreaterThan(0);
    expect(send).toHaveBeenCalledOnce();
  });
});
