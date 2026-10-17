import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import websocket from "@fastify/websocket";
import { registerHealthRoute } from "./routes/health.js";

/**
 * Builds the server app with its plugins and routes, without opening a port.
 * Example: `const app = await buildServerApp({ logger: true }); await app.listen({ port: 3000 });`
 */
export async function buildServerApp(
  options: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify(options);
  await app.register(websocket);
  registerHealthRoute(app);
  return app;
}
