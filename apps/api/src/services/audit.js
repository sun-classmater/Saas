import { auditLogs } from "@saas/db/schema";
import { id, nowIso } from "../lib/core.js";

export async function audit(db, user, action, entityType, entityId = null, details = null) {
  await db.insert(auditLogs).values({
    id: id("audit"),
    userId: user?.id || null,
    action,
    entityType,
    entityId: entityId || null,
    details: details ? JSON.stringify(details) : null,
    createdAt: nowIso()
  });
}
