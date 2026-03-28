# 10-Minute Launch Commands (SQLite)

> Goal: launch quickly on a single machine with SQLite, PM2 and optional reverse proxy.

## 1) Prepare
```bash
cd /Users/admin/Desktop/astrologer
cp .env.example .env
mkdir -p logs data backups
```

## 2) Install & build
```bash
npm install
npm run build
```

## 3) Start service with PM2
```bash
./scripts/start-prod.sh
```

## 4) Verify
```bash
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3001/api/admin/storage
curl -s http://127.0.0.1:3001/api/admin/metrics
```

## 5) Configure backup cron
```bash
(crontab -l 2>/dev/null; echo "10 3 * * * /Users/admin/Desktop/astrologer/scripts/backup-sqlite.sh >> /Users/admin/Desktop/astrologer/logs/backup.log 2>&1") | crontab -
```

## 6) Configure healthcheck cron
```bash
(crontab -l 2>/dev/null; echo "*/2 * * * * /Users/admin/Desktop/astrologer/scripts/healthcheck.sh >> /Users/admin/Desktop/astrologer/logs/healthcheck.log 2>&1") | crontab -
```

## 7) Optional reverse proxy
- Nginx template: `deploy/nginx.conf.example`
- Caddy template: `deploy/Caddyfile.example`

## 8) Stop / restart
```bash
./scripts/stop-prod.sh
./scripts/start-prod.sh
```
