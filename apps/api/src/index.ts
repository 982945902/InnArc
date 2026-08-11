import { buildServer } from "./server.js";
import { appConfig } from "./runtime.js";

const app = buildServer();

try {
  await app.listen({ port: appConfig.port, host: appConfig.host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
