#!/usr/bin/env bash
# Update of PocketMate on the server: backup of the games in progress, code, dependencies, builds, check of the saved
# games with the new engine, restart. Rollback: docs/deployment.md.
set -euo pipefail
cd "$(dirname "$0")/.."
DATA="${PM_DATA_DIR:-data/rooms}"
PORT="${PORT:-8788}"

# 1. Backup of the games in progress (the last 10 kept in data/backups).
if [ -d "$DATA" ]; then
  mkdir -p data/backups
  backup="data/backups/rooms-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).tgz"
  tar -czf "$backup" -C "$(dirname "$DATA")" "$(basename "$DATA")"
  chmod 600 "$backup"
  ls -1t data/backups/rooms-*.tgz | tail -n +11 | xargs -r rm -f
  echo "Games backed up: $backup"
fi

# 2. Code, dependencies, interface and compiled server.
git pull --ff-only
npm ci
npm run build
npm run build:server

# 3. Games in progress replayed with the new engine (on a copy): how many will be interrupted.
npx tsx tools/rooms-check.ts "$DATA" || echo "Warning: some games in progress will be interrupted (see above)."

# 4. Restart.
if pm2 describe pocketmate >/dev/null 2>&1; then
  pm2 restart pocketmate --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    echo "PocketMate updated:"
    curl -fsS "http://127.0.0.1:${PORT}/healthz"
    exit 0
  fi
  sleep 1
done
echo "PocketMate does not answer after 30 s: see pm2 logs pocketmate" >&2
exit 1
