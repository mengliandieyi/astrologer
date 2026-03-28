import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 与项目根目录 `.env` 一致，便于 PORT=3001 时代理仍指向本机 API */
const rootDir = path.resolve(__dirname, "..");

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const apiOrigin = `http://127.0.0.1:${env.PORT || "3000"}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: true,
        },
        "/terms": {
          target: apiOrigin,
          changeOrigin: true,
        },
        "/privacy": {
          target: apiOrigin,
          changeOrigin: true,
        },
      },
    },
  };
});
