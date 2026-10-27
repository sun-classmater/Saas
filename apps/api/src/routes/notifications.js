import { requireUser } from "../lib/request.js";
import { listNotifications, markNotificationRead } from "../services/notifications.js";

export async function notificationRoutes(app) {
  app.get("/notifications", async (request) => {
    const user = await requireUser(app, request);
    return { data: await listNotifications(app.db, user) };
  });

  app.post("/notifications/:id/read", async (request) => {
    const user = await requireUser(app, request);
    await markNotificationRead(app.db, user, decodeURIComponent(request.params.id));
    return { data: { ok: true } };
  });
}
