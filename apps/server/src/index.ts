import { APP_NAME } from "@newcord/shared";
import { buildServerApp } from "./app.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { openDatabase } from "./database/open-database.js";

const config = loadConfigOrExit();
const app = await buildServerApp({
  jwtSecret: config.jwtSecret,
  database: openDatabase(config.databasePath),
  relay: config.relay,
  log: { level: "info" },
  ...(config.trustProxy === undefined ? {} : { trustProxy: config.trustProxy }),
});
await app.listen({ host: config.listenHost, port: 3000 });
app.log.info(`${APP_NAME} server ready`);

function loadConfigOrExit(): ServerConfig {
  try {
    return loadServerConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
