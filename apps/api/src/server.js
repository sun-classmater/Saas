import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { pathToFileURL } from "node:url";
import { config } from "./env.js";
import { registerDb } from "./plugins/db.js";
import { errorHandler } from "./lib/errors.js";
import { HttpError } from "./lib/core.js";
import { requireUser } from "./lib/request.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { notificationRoutes } from "./routes/notifications.js";
import { customerRoutes } from "./routes/admin/customers.js";
import { productRoutes } from "./routes/admin/products.js";
import { priceRoutes } from "./routes/admin/prices.js";
import { supplierRoutes } from "./routes/admin/suppliers.js";
import { inventoryRoutes } from "./routes/admin/inventory.js";
import { orderRoutes } from "./routes/admin/orders.js";
import { adminPaymentRoutes } from "./routes/admin/payments.js";
import { planRoutes, mobilePlanRoutes } from "./routes/admin/plans.js";
import { afterSalesRoutes, mobileAfterSalesRoutes } from "./routes/admin/after-sales.js";
import { reportRoutes } from "./routes/admin/reports.js";
import { financeRoutes } from "./routes/admin/finance.js";
import { shortageRoutes } from "./routes/admin/shortages.js";
import { userRoutes } from "./routes/admin/users.js";
import { ioRoutes } from "./routes/admin/io.js";
import { mobileRoutes } from "./routes/mobile.js";
import { wechatRoutes } from "./routes/wechat.js";

export async function buildApp(options = {}) {
  const app = Fastify({
    logger: options.logger ?? { level: config.logLevel },
    bodyLimit: config.bodyLimit,
    trustProxy: true
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "OPTIONS") return;
    reply.header("Access-Control-Allow-Origin", config.corsOrigin);
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    return reply.code(204).send();
  });

  await app.register(cors, { origin: config.corsOrigin });
  await app.register(rateLimit, {
    global: false,
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    timeWindow: "1 minute"
  });
  if (options.db) {
    app.decorate("db", options.db);
    app.decorate("pool", options.pool ?? null);
    app.decorate("dbPing", options.dbPing ?? (async () => true));
  } else {
    await registerDb(app);
  }

  app.setErrorHandler(errorHandler);
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    request.rawBody = body;
    if (!body || body.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(body.toString("utf8")));
    } catch {
      const error = new Error("Invalid JSON");
      error.statusCode = 400;
      error.code = "FST_ERR_CTP_INVALID_JSON_BODY";
      done(error);
    }
  });
  app.addContentTypeParser("text/plain", { parseAs: "string" }, (request, body, done) => done(null, body));
  app.addContentTypeParser("text/csv", { parseAs: "string" }, (request, body, done) => done(null, body));
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "接口不存在", details: null } });
  });

  app.addHook("preHandler", async (request) => {
    if (!request.url.startsWith("/api/admin")) return;
    const user = await requireUser(app, request);
    if (user.isCustomer) throw new HttpError(404, "NOT_FOUND", "接口不存在");
  });

  app.addHook("preHandler", async (request) => {
    if (!request.url.startsWith("/api/mobile")) return;
    const user = await requireUser(app, request);
    if (!user.isCustomer) throw new HttpError(404, "NOT_FOUND", "接口不存在");
  });

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(notificationRoutes, { prefix: "/api" });
  await app.register(customerRoutes, { prefix: "/api/admin" });
  await app.register(productRoutes, { prefix: "/api/admin" });
  await app.register(priceRoutes, { prefix: "/api/admin" });
  await app.register(supplierRoutes, { prefix: "/api/admin" });
  await app.register(inventoryRoutes, { prefix: "/api/admin" });
  await app.register(orderRoutes, { prefix: "/api/admin" });
  await app.register(adminPaymentRoutes, { prefix: "/api/admin" });
  await app.register(planRoutes, { prefix: "/api/admin" });
  await app.register(afterSalesRoutes, { prefix: "/api/admin" });
  await app.register(reportRoutes, { prefix: "/api/admin" });
  await app.register(financeRoutes, { prefix: "/api/admin" });
  await app.register(shortageRoutes, { prefix: "/api/admin" });
  await app.register(userRoutes, { prefix: "/api/admin" });
  await app.register(ioRoutes, { prefix: "/api/admin" });
  await app.register(mobileRoutes, { prefix: "/api" });
  await app.register(mobilePlanRoutes, { prefix: "/api" });
  await app.register(mobileAfterSalesRoutes, { prefix: "/api" });
  await app.register(wechatRoutes, { prefix: "/api" });

  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`API listening on http://${config.host}:${config.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}
