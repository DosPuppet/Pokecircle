/**
 * pm2 configuration of the PocketMate server (see docs/deployment.md).
 *   pm2 start deploy/ecosystem.config.cjs && pm2 save
 * The server listens locally only: nginx publishes it over HTTPS. Planecircle runs on the same machine on port 8787.
 */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "pocketmate",
      cwd: path.join(__dirname, ".."),
      // Server compiled by "npm run build:server" (engine, cards and ws included; neither tsx nor node_modules at run time).
      script: "packages/server/dist/main.mjs",
      interpreter: "node",
      interpreter_args: "--max-semi-space-size=8 --max-old-space-size=512",
      env: {
        NODE_ENV: "production",
        PORT: 8788,
        HOST: "127.0.0.1",
        // Optional:
        // PM_DECISION_MS: 90000, // time per decision
        // PM_GRACE_MS: 60000,    // time allowed to come back after a disconnection
        // PM_MAX_ROOMS: 200,     // most rooms open at once
        // PM_MAX_HEAP_MB: 384,   // heap beyond which no room is created (before max_memory_restart)
        // PM_AI_WORKERS: 2,      // workers of the online AI seats (0: no online AI)
        // PM_MAX_AI_ROOMS: 12,   // most rooms with AI open at once
        // PM_MAX_RSS_MB: 640,    // RSS (workers included) beyond which no room with AI is created
      },
      autorestart: true,
      max_memory_restart: "768M",
      time: true,
    },
  ],
};
