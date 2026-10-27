import { and, desc, eq } from "drizzle-orm";
import { notifications, users } from "@saas/db/schema";
import { id, nowIso } from "../lib/core.js";

export function mapNotification(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    read: Boolean(row.readAt),
    readAt: row.readAt,
    createdAt: row.createdAt
  };
}

export async function listNotifications(db, user) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  return rows.map(mapNotification);
}

export async function markNotificationRead(db, user, notificationId) {
  await db
    .update(notifications)
    .set({ readAt: nowIso() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id)));
}

export async function notifyCustomer(db, customerId, title, content) {
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.customerId, customerId), eq(users.active, 1)));
  if (recipients.length === 0) return;
  await db.insert(notifications).values(
    recipients.map((recipient) => ({
      id: id("notice"),
      userId: recipient.id,
      title,
      content,
      readAt: null,
      createdAt: nowIso()
    }))
  );
}
