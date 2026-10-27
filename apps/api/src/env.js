import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const envPath = path.join(repoRoot, ".env");

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export const config = {
  repoRoot,
  port: Number(process.env.API_PORT || process.env.PORT || 8788),
  host: process.env.API_HOST || process.env.HOST || "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  databaseUrl: process.env.DATABASE_URL || "",
  wechatMode: process.env.WECHAT_MODE || "mock",
  logLevel: process.env.LOG_LEVEL || "info",
  bodyLimit: Number(process.env.BODY_LIMIT || 4 * 1024 * 1024)
};
