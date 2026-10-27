import { HttpError } from "./core.js";
import { getUserFromToken } from "../services/auth.js";

export function bearerToken(request) {
  const header = request.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

export async function requireUser(app, request) {
  if (request.user) return request.user;
  const token = bearerToken(request);
  const user = await getUserFromToken(app.db, token);
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "登录已失效，请重新登录");
  request.user = { ...user, token };
  return request.user;
}

export function requireBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}
