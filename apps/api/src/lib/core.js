import crypto from "node:crypto";

export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function id(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function asBoolean(value) {
  return Boolean(Number(value));
}

export function cleanText(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function requireText(value, field, maxLength = 200) {
  const text = cleanText(value, maxLength);
  if (!text) throw new HttpError(400, "VALIDATION_ERROR", `${field}不能为空`);
  return text;
}

export function parsePositiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field}必须大于0`);
  }
  return number;
}

export function parsePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field}必须为正整数`);
  }
  return number;
}

export function currentShanghaiParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

export function shanghaiDate(date = new Date()) {
  const parts = currentShanghaiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function settlementWeek(date = new Date()) {
  const dateText = shanghaiDate(date);
  const utc = new Date(`${dateText}T00:00:00Z`);
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - day + 1);
  return utc.toISOString().slice(0, 10);
}

export function serialNumber(prefix) {
  const parts = currentShanghaiParts();
  const stamp = `${parts.year.slice(-2)}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
  return `${prefix}-${stamp}-${crypto.randomInt(1000, 9999)}`;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

export function requireRoles(user, roles) {
  if (!user || !roles.includes(user.role)) {
    throw new HttpError(403, "FORBIDDEN", "没有执行此操作的权限");
  }
}

export function requireStaff(user) {
  if (!user || user.isCustomer) {
    throw new HttpError(403, "FORBIDDEN", "该接口仅供内部人员使用");
  }
}

export function isDuplicateEntry(error) {
  return (
    error?.code === "ER_DUP_ENTRY" ||
    error?.errno === 1062 ||
    error?.cause?.code === "ER_DUP_ENTRY" ||
    error?.cause?.errno === 1062 ||
    /Duplicate entry/i.test(error?.message || "") ||
    /Duplicate entry/i.test(error?.cause?.message || "")
  );
}
