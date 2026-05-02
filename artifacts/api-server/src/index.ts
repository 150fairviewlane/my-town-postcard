import app from "./app";
import { logger } from "./lib/logger";
import { startExpirationSweeper } from "./lib/expirationCleanup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Sweep lapsed reservations every 5 minutes. The interval is unref()'d
  // and the immediate first tick runs in the background — no app.listen
  // ordering concern, just a fire-and-forget background worker.
  startExpirationSweeper(5 * 60 * 1000);
});
