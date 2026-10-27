export async function healthRoutes(app) {
  app.get("/health", async () => ({
    data: {
      status: "ok",
      time: new Date().toISOString(),
      service: "三磊·车邻汇客户订货系统",
      wechatMode: process.env.WECHAT_MODE || "mock",
      database: "mysql"
    }
  }));

  app.get("/health/db", async (request, reply) => {
    try {
      const ok = await app.dbPing();
      return { data: { database: "mysql", ok } };
    } catch (error) {
      request.log.error({ err: error }, "数据库健康检查失败");
      return reply.status(503).send({ error: { code: "DB_UNAVAILABLE", message: "数据库不可用", details: null } });
    }
  });
}
