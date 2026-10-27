import { createDb, closeDb, ping } from "@saas/db";
import { config } from "../env.js";

export async function registerDb(app) {
  const { pool, db } = createDb(config.databaseUrl);
  app.decorate("db", db);
  app.decorate("pool", pool);
  app.decorate("dbPing", () => ping(pool));
  app.addHook("onClose", async () => {
    await closeDb(pool);
  });
  const ok = await ping(pool);
  if (!ok) throw new Error("MySQL 连接测试失败");
  app.log.info("MySQL 连接成功");
}
