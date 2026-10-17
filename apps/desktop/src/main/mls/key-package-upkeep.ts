import {
  KEY_PACKAGE_LOW_WATERMARK,
  KEY_PACKAGE_TARGET,
  type KeyPackageUploadRequest,
  type KeyPackageUploadResponse,
} from "@newcord/shared";
import type { MlsStateStore } from "../local-store/mls-state-store";
import type { ServerCallResult } from "../server-api/server-api-client";
import type { MlsSession } from "./mls-session";

export interface KeyPackageUpkeepDependencies {
  readonly mls: Pick<MlsSession, "runThenSend">;
  readonly stateStore: Pick<
    MlsStateStore,
    "lastResortUploaded" | "markLastResortUploaded"
  >;
  readonly upload: (
    request: KeyPackageUploadRequest,
  ) => Promise<ServerCallResult<KeyPackageUploadResponse>>;
}

/** Keeps the Device's Key packages on the server, so people can add it while it is offline. */
export interface KeyPackageUpkeep {
  /** Tops up to 20 when the server reports fewer than 5; the first upload adds the last-resort one. */
  countReported(count: number): Promise<void>;
}

/**
 * How many ordinary Key packages to upload for a count the server reported: back up to 20 once
 * fewer than 5 remain, otherwise none (09-m2-build Settings).
 * @example keyPackagesToUpload(3) // 17
 */
export function keyPackagesToUpload(count: number): number {
  return count < KEY_PACKAGE_LOW_WATERMARK
    ? Math.max(0, KEY_PACKAGE_TARGET - count)
    : 0;
}

/**
 * Creates the upkeep; one upload runs at a time, and counts reported meanwhile are ignored.
 * @example const upkeep = createKeyPackageUpkeep({ mls, stateStore, upload });
 */
export function createKeyPackageUpkeep(
  dependencies: KeyPackageUpkeepDependencies,
): KeyPackageUpkeep {
  let uploading = false;
  return {
    countReported: async (count): Promise<void> => {
      const needed = keyPackagesToUpload(count);
      const lastResort = !dependencies.stateStore.lastResortUploaded();
      if (uploading || (needed === 0 && !lastResort)) return;
      uploading = true;
      try {
        await uploadKeyPackages(dependencies, needed, lastResort);
      } finally {
        uploading = false;
      }
    },
  };
}

async function uploadKeyPackages(
  dependencies: KeyPackageUpkeepDependencies,
  ordinaryCount: number,
  withLastResort: boolean,
): Promise<void> {
  const total = ordinaryCount + (withLastResort ? 1 : 0);
  const result = await dependencies.mls.runThenSend(
    (engine) => engine.createKeyPackages(total, withLastResort),
    (packages) => dependencies.upload(uploadRequest(packages, withLastResort)),
  );
  if (result.ok && withLastResort) {
    dependencies.stateStore.markLastResortUploaded();
  }
}

function uploadRequest(
  packages: readonly Uint8Array[],
  withLastResort: boolean,
): KeyPackageUploadRequest {
  const encoded = packages.map((data) => Buffer.from(data).toString("base64"));
  if (!withLastResort) return { keyPackages: encoded };
  return { keyPackages: encoded.slice(0, -1), lastResort: encoded.at(-1) };
}
