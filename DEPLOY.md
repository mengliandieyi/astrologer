# 生产部署说明

本项目是一个 Vite React 前端 + Express/TypeScript 后端应用。生产环境构建后，后端会直接托管 `web/dist`，对外只需要暴露一个 Node 服务端口，默认 `3001`。

## 1. 服务器准备

推荐环境：

- Ubuntu 22.04/24.04
- Node.js 20 LTS 或 22 LTS
- npm
- Nginx 或 Caddy
- PM2
- 可选：MySQL/PostgreSQL，用于线上持久化数据

基础安装示例：

```bash
sudo apt update
sudo apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. 拉取代码

```bash
sudo mkdir -p /opt/astrologer
sudo chown -R "$USER":"$USER" /opt/astrologer
git clone <你的仓库地址> /opt/astrologer
cd /opt/astrologer
```

如果代码已经在服务器上，进入项目目录即可：

```bash
cd /opt/astrologer
```

## 3. 配置环境变量

复制示例文件：

```bash
cp .env.example .env
nano .env
```

最低需要确认：

```env
PORT=3001
STORAGE_MODE=sqlite
AUTH_JWT_SECRET=请替换成至少32位的随机字符串
ALI_API_KEY=你的通义千问API Key
ALI_MODEL=qwen3-max
TUSHARE_TOKEN=你的Tushare Token
```

如果线上有登录注册、历史盘面、选股缓存等长期数据，建议使用 MySQL：

```env
STORAGE_MODE=mysql
MYSQL_URL=mysql://user:password@127.0.0.1:3306/astrologer?charset=utf8mb4&timezone=Z
```

也可以使用 PostgreSQL：

```env
STORAGE_MODE=postgres
DATABASE_URL=postgres://postgres:password@127.0.0.1:5432/astrologer
PGSSL=false
```

安全注意：

- 不要把 `.env` 提交到 Git。
- 本地 `.env` 里如果有真实密钥，部署前确认仓库没有提交这些内容。
- `AUTH_JWT_SECRET` 线上必须使用自己的随机长字符串。
- 如果开放 `/api/admin/*`，建议配置 `ADMIN_TOKEN`。

## 4. 构建并启动

项目已有生产脚本：

```bash
npm run prod:start
```

这个脚本会执行：

- 安装根目录依赖：`npm ci`
- 安装前端依赖：`npm ci --prefix web`
- 构建前端和后端：`npm run build`
- 用 PM2 启动：`dist/bootstrap.js`

查看状态：

```bash
npx pm2 status
npx pm2 logs astrologer
```

设置开机自启：

```bash
pm2 startup
pm2 save
```

`pm2 startup` 会输出一条需要 `sudo` 执行的命令，按它提示执行一次。

## 5. Nginx 反代

项目已有示例：`deploy/nginx.conf.example`。

复制配置：

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/astrologer
sudo ln -sf /etc/nginx/sites-available/astrologer /etc/nginx/sites-enabled/astrologer
sudo nano /etc/nginx/sites-available/astrologer
```

把里面的域名改成你的域名：

```nginx
server {
  listen 80;
  server_name example.com www.example.com;
  client_max_body_size 10m;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

签发 HTTPS 证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

AI 解读接口可能耗时较长。如果线上出现 504 或浏览器请求超时，可以在 Nginx 的 `location /` 中加：

```nginx
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
send_timeout 300s;
```

## 6. Caddy 方案

如果不用 Nginx，也可以用 Caddy。项目已有示例：`deploy/Caddyfile.example`。

核心配置：

```caddyfile
example.com, www.example.com {
  encode gzip zstd
  reverse_proxy 127.0.0.1:3001 {
    transport http {
      dial_timeout 30s
      response_header_timeout 300s
      read_timeout 300s
    }
  }
}
```

Caddy 会自动申请和续期 HTTPS 证书。

## 7. 健康检查

本地检查：

```bash
curl http://127.0.0.1:3001/health
```

项目脚本：

```bash
npm run prod:health
```

接口正常时会返回类似：

```json
{
  "ok": true,
  "storage_mode": "sqlite",
  "uptime_sec": 123,
  "now": "2026-05-14T00:00:00.000Z"
}
```

## 8. 更新发布

服务器上更新代码：

```bash
cd /opt/astrologer
git pull
npm run prod:start
```

如果只想重启：

```bash
npx pm2 restart astrologer --update-env
```

停止服务：

```bash
npm run prod:stop
```

## 9. 数据备份

如果使用 SQLite，项目已有备份脚本：

```bash
npm run backup
```

可以参考 `deploy/crontab.example` 配置定时任务，但服务器路径需要改成你的实际路径，例如：

```cron
10 3 * * * /opt/astrologer/scripts/backup-sqlite.sh >> /opt/astrologer/logs/backup.log 2>&1
```

如果使用 MySQL/PostgreSQL，应使用数据库自己的备份机制，例如 `mysqldump` 或 `pg_dump`。

## 10. 常见问题

### 502 Bad Gateway

通常是 Node 服务没起来，或 Nginx 反代端口不一致。

检查：

```bash
npx pm2 status
npx pm2 logs astrologer
curl http://127.0.0.1:3001/health
```

确认 `.env` 和 `ecosystem.config.cjs` 里的端口都是 `3001`，Nginx 的 `proxy_pass` 也是 `127.0.0.1:3001`。

### 页面能打开，但 API 报错

检查 `.env`：

- `ALI_API_KEY`
- `AUTH_JWT_SECRET`
- `TUSHARE_TOKEN`
- `STOCK_NEWS_FEEDS`（可选；热点新闻 RSS，见 `.env.example`）
- `STORAGE_MODE`
- `MYSQL_URL` 或 `DATABASE_URL`

修改 `.env` 后需要重启：

```bash
npx pm2 restart astrologer --update-env
```

### 构建失败

先分别确认依赖安装和构建：

```bash
npm ci
npm ci --prefix web
npm run build
```

如果是内存不足，给服务器加 swap，或换更高内存实例。

### 资研「热点新闻」一直为空

服务端会拉取 RSS（内置默认：华尔街见闻 + 中新网财经，或环境变量 `STOCK_NEWS_FEEDS`）。若列表长期无条目：

- 确认服务器出口能访问 RSS 域名（防火墙、DNS、代理）。
- 在 `.env` 中配置 `STOCK_NEWS_FEEDS`：每项为 `显示名|RSS_URL`，或单独一行 `https://...`（显示名自动取域名）；多条用英文逗号或换行分隔；须为含 `<item>` 的标准 RSS/XML，不要用频道 HTML 页。
- 修改后执行 `npx pm2 restart astrologer --update-env`。

页内 **AI 要点总结** 需配置 `ALI_API_KEY`（通义）；接口为 `POST /api/stocks/news/hot/summary`，与其他 AI 路由共用 `AI_RATE_LIMIT_PER_MIN` 用户级限流。

### AI 解读请求超时

优先检查反代超时配置。Nginx 加 `proxy_read_timeout 300s;`，Caddy 示例里已经配置 `read_timeout 300s`。

### 静态页面 404

生产环境不要只部署 `web/dist`。这个项目的前端由 Express 统一托管，应该启动根目录的 Node 服务，并通过 Nginx/Caddy 反代到 `PORT=3001`。
