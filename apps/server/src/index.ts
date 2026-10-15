import { APP_NAME } from "@newcord/shared";
import { buildServerApp } from "./app.js";

const app = await buildServerApp({ logger: true });
await app.listen({ port: 3000 });
app.log.info(`${APP_NAME} server ready`);
