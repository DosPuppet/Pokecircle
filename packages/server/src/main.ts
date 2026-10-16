/**
 * Server start-up: `npm run server`.
 * Variables: PORT (8788), HOST (0.0.0.0; 127.0.0.1 behind nginx), PK_DECISION_MS, PK_GRACE_MS (durations of the timer
 * and of the return delay), PK_MAX_ROOMS (200), PK_DATA_DIR (save of the games in progress, `data/rooms` by default;
 * "off" to keep the games in memory only), PK_ORIGINS (origins allowed for the WebSocket besides the same host,
 * comma-separated), PK_MAX_ROOMS_PER_IP (4), PK_MAX_HEAP_MB (384), PK_AI_WORKERS (workers of the AI seats, at most 2 by
 * default; 0: no online AI), PK_MAX_AI_ROOMS (12), PK_MAX_RSS_MB (640).
 */
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./index";

const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
const staticDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "client", "dist");

const host = process.env.HOST || "0.0.0.0";
const server = await startServer({
  port: num(process.env.PORT) ?? 8788,
  host,
  staticDir,
  ...(num(process.env.PK_AI_WORKERS) !== undefined ? { aiWorkers: num(process.env.PK_AI_WORKERS) } : {}),
  allowedOrigins: (process.env.PK_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  config: {
    ...(num(process.env.PK_MAX_ROOMS_PER_IP) ? { maxRoomsPerIp: num(process.env.PK_MAX_ROOMS_PER_IP) } : {}),
    ...(num(process.env.PK_DECISION_MS) ? { decisionMs: num(process.env.PK_DECISION_MS) } : {}),
    ...(num(process.env.PK_GRACE_MS) ? { graceMs: num(process.env.PK_GRACE_MS) } : {}),
    ...(num(process.env.PK_MAX_ROOMS) ? { maxRooms: num(process.env.PK_MAX_ROOMS) } : {}),
    ...(num(process.env.PK_MAX_HEAP_MB) ? { maxHeapMb: num(process.env.PK_MAX_HEAP_MB) } : {}),
    ...(num(process.env.PK_MAX_AI_ROOMS) ? { maxAiRooms: num(process.env.PK_MAX_AI_ROOMS) } : {}),
    ...(num(process.env.PK_MAX_RSS_MB) ? { maxRssMb: num(process.env.PK_MAX_RSS_MB) } : {}),
    // Saved games: resumed after a restart (pm2 restart, update).
    ...(process.env.PK_DATA_DIR === "off" ? {} : { dataDir: process.env.PK_DATA_DIR || join(process.cwd(), "data", "rooms") }),
  },
});

const lan = (host === "0.0.0.0" ? Object.values(networkInterfaces()) : [])
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a?.address}:${server.port}`);
console.log(`Pokecircle — server online on port ${server.port}`);
console.log(
  `  local: http://${host === "0.0.0.0" ? "localhost" : host}:${server.port}${lan.length ? `\n  network: ${lan.join(", ")}` : ""}`,
);
console.log(`  (client served from packages/client/dist: run "npm run build" after a change)`);

const stop = () => server.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
