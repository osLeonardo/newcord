import {
  KeyPackageUploadRequest,
  KeyPackageUploadResponse,
} from "@newcord/shared";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance, onRequestHookHandler } from "fastify";
import { authenticatedSubject } from "../sessions/access-token-check.js";
import type { KeyPackageStore } from "./key-package-store.js";

export interface KeyPackageRouteDependencies {
  checkAccessToken: onRequestHookHandler;
  keyPackageStore: Pick<KeyPackageStore, "store">;
  /**
   * Told after a Device uploaded packages: a new Device can only be added once it has some, so
   * its Account's Groups are prompted again then (D56).
   */
  onKeyPackagesUploaded?: (userId: number) => void;
}

/**
 * Adds `POST /keypackages`: a logged-in Device uploads a batch of its own Key packages (06-message-formats).
 * Example: `registerKeyPackageRoute(app, { checkAccessToken, keyPackageStore });`
 */
export function registerKeyPackageRoute(
  app: FastifyInstance,
  dependencies: KeyPackageRouteDependencies,
): void {
  app.withTypeProvider<TypeBoxTypeProvider>().post(
    "/keypackages",
    {
      schema: {
        body: KeyPackageUploadRequest,
        response: { 200: KeyPackageUploadResponse },
      },
      onRequest: dependencies.checkAccessToken,
    },
    (request): KeyPackageUploadResponse => {
      const { lastResort, keyPackages } = request.body;
      const subject = authenticatedSubject(request);
      const count = dependencies.keyPackageStore.store(
        subject.deviceId,
        keyPackages.map((keyPackage) => Buffer.from(keyPackage, "base64")),
        lastResort === undefined
          ? undefined
          : Buffer.from(lastResort, "base64"),
      );
      dependencies.onKeyPackagesUploaded?.(subject.userId);
      return { count };
    },
  );
}
