import { requireUser } from "../../lib/request.js";
import { dashboard, planExecutionReport } from "../../services/reports.js";

export async function reportRoutes(app) {
  app.get("/dashboard", async (request) => {
    const user = await requireUser(app, request);
    return { data: await dashboard(app.db, user) };
  });

  app.get("/reports/plan-execution", async (request) => {
    await requireUser(app, request);
    return { data: await planExecutionReport(app.db) };
  });
}
