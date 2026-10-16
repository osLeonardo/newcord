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
      const count = dependencies.keyPackageStore.store(
        authenticatedSubject(request).deviceId,
        keyPackages.map((keyPackage) => Buffer.from(keyPackage, "base64")),
        lastResort === undefined
          ? undefined
          : Buffer.from(lastResort, "base64"),
      );
      return { count };
    },
  );
}
