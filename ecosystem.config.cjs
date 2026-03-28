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
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        STORAGE_MODE: "sqlite",
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      max_memory_restart: "500M",
      restart_delay: 3000,
    },
  ],
};
