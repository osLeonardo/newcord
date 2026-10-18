import { APP_NAME } from "@newcord/shared";
import { buildServerApp } from "./app.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { openDatabase } from "./database/open-database.js";

const config = loadConfigOrExit();
const database = openDatabaseOrExit(config.databasePath);
const app = await buildServerApp({
  jwtSecret: config.jwtSecret,
  database,
  relay: config.relay,
  log: { level: "info" },
  ...(config.trustProxy === undefined ? {} : { trustProxy: config.trustProxy }),
});
await app.listen({ host: config.listenHost, port: 3000 });
app.log.info(`${APP_NAME} server ready`);

// systemd stops the service with SIGTERM: stop taking requests, close every socket with "going
// away" so the apps reconnect, and close the database before exiting.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info(`${signal}: shutting down`);
    app.close().then(
      () => {
        database.close();
        process.exit(0);
      },
      (error: unknown) => {
        app.log.error(error);
        process.exit(1);
      },
    );
  });
}

function loadConfigOrExit(): ServerConfig {
  try {
    return loadServerConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function openDatabaseOrExit(path: string): ReturnType<typeof openDatabase> {
  try {
    return openDatabase(path);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
