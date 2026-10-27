import { cleanText, HttpError } from "../lib/core.js";
import { first, run } from "../lib/sql.js";
import { exchangeLoginCode, exchangePhoneCode } from "../lib/wechat.js";
import { loginLimitKey, enforceLoginRateLimit, recordLoginFailure, resetLoginFailures } from "../lib/login-rate-limit.js";
import { bearerToken, requireBody, requireUser } from "../lib/request.js";
import {
  changePassword,
  createSession,
  findCustomerByPhone,
  loginWithPassword,
  revokeOtherSessions,
  revokeSession
} from "../services/auth.js";
import { getCustomerProfile } from "../services/customers.js";

export async function authRoutes(app) {
  app.post("/auth/login", async (request) => {
    const body = requireBody(request);
    const key = loginLimitKey(request, body.username);
    enforceLoginRateLimit(key);
    let user;
    try {
      user = await loginWithPassword(app.db, body.username, body.password);
    } catch (error) {
      recordLoginFailure(key);
      throw error;
    }
    resetLoginFailures(key);
    const token = await createSession(app.db, user.id);
    return {
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          customerId: user.customerId
        }
      }
    };
  });

  app.post("/auth/dev-login", async (request) => {
    if ((process.env.WECHAT_MODE || "mock") !== "mock") {
      throw new HttpError(403, "DEV_LOGIN_DISABLED", "正式模式不允许手机号快捷登录");
    }
    const body = requireBody(request);
    const phone = cleanText(body.phone);
    const user = await findCustomerByPhone(app.db, phone);
    if (!user) throw new HttpError(401, "CUSTOMER_NOT_FOUND", "该手机号尚未由后台开通客户账号");
    const token = await createSession(app.db, user.id);
    return {
      data: {
        token,
        user: {
          id: user.id,
          displayName: user.displayName,
          phone: user.phone,
          role: user.role,
          customerId: user.customerId
        },
        mode: "mock"
      }
    };
  });

  app.post("/auth/wechat-login", async (request) => {
    if ((process.env.WECHAT_MODE || "mock") === "mock") {
      throw new HttpError(400, "WECHAT_MOCK_MODE", "测试环境请使用手机号快捷登录");
    }
    const body = requireBody(request);
    if (!body.code) throw new HttpError(400, "VALIDATION_ERROR", "微信登录凭证不能为空");
    if (!body.phoneCode) throw new HttpError(400, "VALIDATION_ERROR", "微信手机号授权凭证不能为空");
    const session = await exchangeLoginCode(body.code);
    const phone = await exchangePhoneCode(body.phoneCode);
    let user = await first(app.db.$client, "SELECT * FROM users WHERE wechat_openid = ? AND active = 1", [
      session.openid
    ]);
    if (!user) {
      user = await first(
        app.db.$client,
        "SELECT * FROM users WHERE phone = ? AND role LIKE 'CUSTOMER\\_%' AND active = 1",
        [phone]
      );
      if (!user) throw new HttpError(401, "CUSTOMER_NOT_FOUND", "该微信手机号尚未由后台开通客户账号");
      const conflict = await first(
        app.db.$client,
        "SELECT id FROM users WHERE wechat_openid = ? AND id != ?",
        [session.openid, user.id]
      );
      if (conflict) throw new HttpError(409, "WECHAT_ACCOUNT_CONFLICT", "该微信身份已绑定其他客户账号");
      await run(app.db.$client, "UPDATE users SET wechat_openid = ?, phone = ? WHERE id = ?", [
        session.openid,
        phone,
        user.id
      ]);
      user = await first(app.db.$client, "SELECT * FROM users WHERE id = ?", [user.id]);
    }
    const token = await createSession(app.db, user.id);
    return {
      data: {
        token,
        user: {
          id: user.id,
          displayName: user.display_name,
          phone: user.phone,
          role: user.role,
          customerId: user.customer_id
        },
        mode: "wechat"
      }
    };
  });

  app.post("/auth/logout", async (request) => {
    await requireUser(app, request);
    await revokeSession(app.db, bearerToken(request));
    return { data: { ok: true } };
  });

  app.post("/auth/change-password", async (request) => {
    const user = await requireUser(app, request);
    if (user.isCustomer) throw new HttpError(403, "FORBIDDEN", "客户账号使用微信授权登录");
    const body = requireBody(request);
    await changePassword(app.db, user, body.currentPassword, body.newPassword);
    await revokeOtherSessions(app.db, user.id, user.token);
    return { data: { ok: true } };
  });

  app.get("/me", async (request) => {
    const user = await requireUser(app, request);
    const data = { user };
    if (user.isCustomer) {
      data.customer = await getCustomerProfile(app.db, user.customerId);
    }
    return { data };
  });
}
