import type { FastifyInstance } from "fastify";

type HealthResponse = { ok: true };

/**
 * Registers `GET /health`, which answers `{"ok":true}` while the server is up.
 * Example: `registerHealthRoute(app);`
 */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get("/health", (): HealthResponse => ({ ok: true }));
}
