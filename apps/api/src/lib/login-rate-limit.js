import { HttpError } from "./core.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const attempts = new Map();

export function loginLimitKey(request, username) {
  return `${request.ip}|${String(username || "").trim().toLowerCase()}`;
}

export function enforceLoginRateLimit(key) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt < now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return;
  }
  if (record.count >= MAX_FAILURES) {
    throw new HttpError(429, "LOGIN_RATE_LIMITED", "登录失败次数过多，请15分钟后再试");
  }
}

export function recordLoginFailure(key) {
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };
  record.count += 1;
  attempts.set(key, record);
}

export function resetLoginFailures(key) {
  attempts.delete(key);
}
