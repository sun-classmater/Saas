import http from "node:http";
import { loadEnv } from "./env.js";
import { createRequestHandler } from "./routes.js";

loadEnv();
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8787);
const handler = createRequestHandler();
const server = http.createServer(handler);

server.listen(port, host, () => {
  console.log(`三磊·车邻汇订货系统已启动：http://localhost:${port}`);
  console.log("演示管理账号：admin / Admin@123（其他内部账号使用相同密码）");
});

function shutdown(signal) {
  console.log(`收到${signal}，正在关闭服务...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export { server };
