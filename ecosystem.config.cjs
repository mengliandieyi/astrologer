const path = require("path");

module.exports = {
  apps: [
    {
      name: "astrologer",
      cwd: path.join(__dirname),
      script: "dist/server.js",
      interpreter: "node",
      node_args: "--enable-source-maps",
      instances: 1,
      exec_mode: "fork",
      // 不要在此写 STORAGE_MODE：PM2 会先注入 env，dotenv 默认不会覆盖已有变量，
      // 会导致 .env 里的 STORAGE_MODE=mysql 不生效。存储模式请在 /opt/astrologer/.env 配置。
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      max_memory_restart: "500M",
      restart_delay: 3000,
    },
  ],
};
