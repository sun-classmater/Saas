import crypto from "node:crypto";
import { and, eq, gt, like, lt, ne } from "drizzle-orm";
import { sessions, users } from "@saas/db/schema";
import { cleanText, hashPassword, HttpError, nowIso, verifyPassword } from "../lib/core.js";

const SESSION_TTL_HOURS = 24 * 14;

export function mapAuthUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    phone: row.phone,
    wechatOpenid: row.wechatOpenid,
    role: row.role,
    customerId: row.customerId,
    isCustomer: row.role === "CUSTOMER_ADMIN" || row.role === "CUSTOMER_BUYER"
  };
}

export async function loginWithPassword(db, username, password) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.username, cleanText(username)), eq(users.active, 1)))
    .limit(1);
  if (!user || !user.passwordHash || !verifyPassword(String(password ?? ""), user.passwordHash)) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "用户名或密码错误");
  }
  return user;
}

export async function createSession(db, userId, ttlHours = SESSION_TTL_HOURS) {
  const token = crypto.randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  await db.delete(sessions).where(lt(sessions.expiresAt, createdAt));
  await db.insert(sessions).values({ token, userId, expiresAt, createdAt });
  return token;
}

export async function getUserFromToken(db, token) {
  if (!token) return null;
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      phone: users.phone,
      wechatOpenid: users.wechatOpenid,
      role: users.role,
      customerId: users.customerId
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, nowIso()), eq(users.active, 1)))
    .limit(1);
  return row ? mapAuthUser(row) : null;
}

export async function revokeSession(db, token) {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function revokeOtherSessions(db, userId, currentToken) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.token, currentToken)));
}

export async function changePassword(db, user, currentPassword, newPassword) {
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !verifyPassword(String(currentPassword || ""), row.passwordHash)) {
    throw new HttpError(400, "CURRENT_PASSWORD_INVALID", "当前密码不正确");
  }
  const password = String(newPassword || "");
  if (password.length < 8) throw new HttpError(400, "WEAK_PASSWORD", "新密码至少8位");
  await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, user.id));
}

export async function findCustomerByPhone(db, phone) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.phone, cleanText(phone)), eq(users.active, 1), like(users.role, "CUSTOMER\\_%")))
    .limit(1);
  return user || null;
}
