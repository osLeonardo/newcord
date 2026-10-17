import type {
  KeyPackageUploadRequest,
  KeyPackageUploadResponse,
} from "@newcord/shared";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdentityKeyPair } from "../src/main/identity/identity-key";
import {
  createMlsStateStore,
  type MlsStateStore,
} from "../src/main/local-store/mls-state-store";
import {
  createKeyPackageUpkeep,
  keyPackagesToUpload,
  type KeyPackageUpkeep,
} from "../src/main/mls/key-package-upkeep";
import { openMlsSession } from "../src/main/mls/mls-session";
import type { ServerCallResult } from "../src/main/server-api/server-api-client";
import { createFakeMlsEngine } from "./support/fake-mls-engine";

type UploadResult = ServerCallResult<KeyPackageUploadResponse>;
type Upload = (request: KeyPackageUploadRequest) => Promise<UploadResult>;

let database: Database.Database;
let stateStore: MlsStateStore;

beforeEach(() => {
  database = new Database(":memory:");
  stateStore = createMlsStateStore(database);
});

afterEach(() => {
  database.close();
});

function upkeepWith(upload: Upload): KeyPackageUpkeep {
  const mls = openMlsSession({
    stateStore,
    createEngine: createFakeMlsEngine,
    device: {
      keyPair: createIdentityKeyPair(),
      username: "alice",
      deviceId: "mJMEbgts33NWbvGmNqkuEw",
    },
  });
  return createKeyPackageUpkeep({ mls, stateStore, upload });
}

function uploadAnswering(count: number): ReturnType<typeof vi.fn<Upload>> {
  return vi.fn<Upload>(() => Promise.resolve({ ok: true, body: { count } }));
}

describe("keyPackagesToUpload", () => {
  it.each([
    [0, 20],
    [4, 16],
    [5, 0],
    [19, 0],
  ])("tops up a count of %i with %i packages", (count, expected) => {
    expect(keyPackagesToUpload(count)).toBe(expected);
  });
});

describe("createKeyPackageUpkeep", () => {
  it("uploads 20 packages and a last-resort one the first time", async () => {
    const upload = uploadAnswering(20);

    await upkeepWith(upload).countReported(0);

    const request = upload.mock.calls[0]?.[0];
    expect(request?.keyPackages).toHaveLength(20);
    expect(request?.lastResort).toBeDefined();
    expect(stateStore.lastResortUploaded()).toBe(true);
  });

  it("tops up without another last-resort package once one was uploaded", async () => {
    const upload = uploadAnswering(20);
    const upkeep = upkeepWith(upload);
    await upkeep.countReported(0);

    await upkeep.countReported(3);

    const topUp = upload.mock.calls[1]?.[0];
    expect(topUp?.keyPackages).toHaveLength(17);
    expect(topUp?.lastResort).toBeUndefined();
  });

  it("uploads nothing while 5 or more remain and the last-resort package is there", async () => {
    const upload = uploadAnswering(20);
    const upkeep = upkeepWith(upload);
    await upkeep.countReported(0);

    await upkeep.countReported(5);

    expect(upload).toHaveBeenCalledOnce();
  });

  it("uploads once when counts arrive during an upload", async () => {
    let finish: (result: UploadResult) => void = () => undefined;
    const upload = vi.fn<Upload>(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const upkeep = upkeepWith(upload);

    const first = upkeep.countReported(0);
    await upkeep.countReported(0);
    finish({ ok: true, body: { count: 20 } });
    await first;

    expect(upload).toHaveBeenCalledOnce();
  });

  it("tries the last-resort package again after a failed upload", async () => {
    const upload = vi
      .fn<Upload>()
      .mockResolvedValueOnce({ ok: false, failure: "SERVER_UNREACHABLE" })
      .mockResolvedValue({ ok: true, body: { count: 20 } });
    const upkeep = upkeepWith(upload);

    await upkeep.countReported(0);
    expect(stateStore.lastResortUploaded()).toBe(false);
    await upkeep.countReported(20);

    const retry = upload.mock.calls[1]?.[0];
    expect(retry?.keyPackages).toEqual([]);
    expect(retry?.lastResort).toBeDefined();
  });
});
