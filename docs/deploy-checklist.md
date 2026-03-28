# Deploy Checklist (Production)

## 1) Infrastructure
- Use a fixed domain and HTTPS (Nginx/Caddy).
- Run app as a managed process (pm2/systemd).
- Default storage is SQLite; PostgreSQL is optional.
- Set `ADMIN_TOKEN` for `/api/admin/*`.

## 2) Runtime
- Copy `.env.example` to `.env` and fill values.
- Install **both** roots: `npm ci` and `npm ci --prefix web` (Vite lives under `web/`).
- `npm run build` (or `./scripts/start-prod.sh`, which runs the two `npm ci` then build).
- PM2 startup:
  - `mkdir -p logs`
  - `pm2 start ecosystem.config.cjs`
  - `pm2 save`

## 3) Verify
- `GET /health` returns `{ "ok": true }`
- `GET /api/admin/storage` shows `sqlite` (or `postgres` if configured)
- `POST /api/bazi/calculate` succeeds
- `POST /api/share-cards/render` returns share URL
- `GET /terms` and `GET /privacy` reachable
- `GET /share/:chartId.svg` reachable

## 4) Monitoring
- Poll `/api/admin/metrics` every minute.
- Alert when 5xx rate spikes or health fails.
- Add sqlite backup cron from `deploy/crontab.example`.

## 5) Rollback
- Keep previous build and env file.
- Switch process to previous `dist/` quickly.
