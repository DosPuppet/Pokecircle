# Deployment

Pokecircle runs on the user's shared VPS next to Planecircle: same nginx, **no Docker, no Caddy, no systemd unit**.
The Node server (pm2) listens on `127.0.0.1:8788` (Planecircle: 8787); nginx publishes it over HTTPS.

## First installation

```bash
# As the account that runs the applications (Node 24 and pm2 already installed for Planecircle):
git clone <repository> ~/pokecircle && cd ~/pokecircle
npm ci
npm run build          # interface → packages/client/dist
npm run build:server   # server → packages/server/dist/main.mjs (+ ai-worker.mjs)
pm2 start deploy/ecosystem.config.cjs && pm2 save
curl -s http://127.0.0.1:8788/healthz   # versions, memory, rooms
```

nginx (as root):

```bash
cp deploy/nginx-pokecircle.conf /etc/nginx/sites-available/pokecircle   # replace pokemon.example.org
ln -s ../sites-available/pokecircle /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d pokemon.example.org
```

The site **does not redeclare** `map $http_upgrade $connection_upgrade`: Planecircle's site already declares it on the
same nginx (a duplicate is refused). The TCGdex image cache has its own zone (`pokecircle_tcgdex`).

## Updates

`deploy/update.sh`: backup of the games in progress (`data/backups/`, the last 10), `git pull`, `npm ci`, builds, check
of the saved games with the new engine (`tools/rooms-check.ts`: how many will resume, how many a rules change will
interrupt), `pm2 restart pokecircle`, wait for `/healthz`.

## Saved games

- One file per room in `data/rooms/` (`PK_DATA_DIR`; mode 600): header (seats with token digests, decks, seed), then one
  line per decision with the digest of the resulting state.
- On start-up, every game is replayed and resumed; players come back with the token their browser kept
  (`pokecircle.online`). A game recorded with another `RULES_VERSION` resumes only if every decision replays to the same
  digest; otherwise it is set aside (`.rules<N>`, deleted after 7 days) and its players are told.

## Rollback

```bash
pm2 stop pokecircle
git checkout <previous commit> && npm ci && npm run build && npm run build:server
tar -xzf data/backups/rooms-<date>-<commit>.tgz -C data   # the games saved before the update
pm2 start pokecircle
```

## Environment

`PORT`, `HOST`, `PK_DECISION_MS` (90 s per decision, rope during the last 20 s, 3 timeouts lose), `PK_GRACE_MS` (60 s to
come back), `PK_MAX_ROOMS`, `PK_MAX_ROOMS_PER_IP`, `PK_MAX_HEAP_MB`, `PK_AI_WORKERS` (AI seats; 0: none),
`PK_MAX_AI_ROOMS`, `PK_MAX_RSS_MB`, `PK_ORIGINS`, `PK_DATA_DIR` (`off`: games in memory only). See
`packages/server/src/main.ts`.

## Local network and development

- `npm run dev` (Vite, port 5174, proxies `/ws` and `/tcgdex` to the server) and `npm run server` (tsx, port 8788).
- `npm run build && npm run server`: the server also serves the built interface on `http://<ip>:8788`.
