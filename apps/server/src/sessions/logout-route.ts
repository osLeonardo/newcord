import type {
  FastifyInstance,
  FastifyReply,
  onRequestHookHandler,
} from "fastify";
import { authenticatedSubject } from "./access-token-check.js";
import type { DeviceLogout } from "./device-logout.js";

export interface LogoutRouteDependencies {
  checkAccessToken: onRequestHookHandler;
  logOutDevice: DeviceLogout;
}

/**
 * Adds `POST /logout`, which logs out the Device named by the access token.
 * Example: `registerLogoutRoute(app, { checkAccessToken, logOutDevice });`
 */
export function registerLogoutRoute(
  app: FastifyInstance,
  dependencies: LogoutRouteDependencies,
): void {
  app.post(
    "/logout",
    { onRequest: dependencies.checkAccessToken },
    (request, reply): FastifyReply => {
      dependencies.logOutDevice(authenticatedSubject(request).deviceId);
      return reply.code(204).send();
    },
  );
}
