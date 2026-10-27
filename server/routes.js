import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, hashPassword, verifyPassword } from "./database.js";
import {
  HttpError,
  asBoolean,
  cleanText,
  createSession,
  getUserFromToken,
  loginWithPassword,
  productCatalog,
  requireRoles,
  requireStaff,
  requireText
} from "./core.js";
import {
  acceptOrder,
  cancelOrder,
  completeMockPayment,
  confirmOrder,
  createAfterSalesCase,
  createOrder,
  createPayment,
  createPlan,
  dashboard,
  getOrder,
  listAfterSales,
  listInventory,
  listOrders,
  listPlans,
  markWechatPaymentSucceeded,
  getCustomerProfile,
  planAction,
  planExecutionReport,
  receiveShipment,
  shipOrder,
  updateAfterSalesStatus,
  updatePlan,
  adjustInventory
} from "./business.js";
import {
  createCustomerUser,
  createStaffUser,
  getAuditLogs,
  getCustomerAuthorizations,
  getPriceMatrix,
  listCustomers,
  listPayments,
  listProducts,
  listSuppliers,
  listUsers,
  previewEffectivePrices,
  saveCustomer,
  saveProduct,
  saveSupplier,
  setCustomerAuthorizations,
  setPrice,
  toggleUser
} from "./admin.js";
import { exportData, exportXlsx, getTemplate, getXlsxTemplate, importData, importXlsx } from "./csv.js";
import {
  applyShortageAllocation,
  createAdjustment,
  createFreight,
  createInvoice,
  listFinancialRecords,
  listInventoryMovements,
  listShortageProducts,
  previewShortageAllocation,
  settleFinancialRecord,
  transferInventory,
  updateInvoiceStatus
} from "./operations.js";
import {
  exchangeLoginCode,
  exchangePhoneCode,
  isWechatMock,
  verifyAndDecryptNotification
} from "./wechat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, "..", "admin");
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const loginAttempts = new Map();

export function createRequestHandler(options = {}) {
  const db = options.db || createDatabase(options.dbPath);
  return async function requestHandler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try {
      if (requestUrl.pathname.startsWith("/api/")) {
        await handleApi(req, res, requestUrl, db);
        return;
      }
      await serveStatic(req, res, requestUrl);
    } catch (error) {
      sendError(res, error);
    }
  };
}

async function handleApi(req, res, url, db) {
  const pathname = url.pathname;
  const method = req.method;
  if (pathname === "/api/health" && method === "GET") {
    return sendJson(res, 200, {
      data: {
        status: "ok",
        time: new Date().toISOString(),
        service: "三磊·车邻汇客户订货系统",
        wechatMode: process.env.WECHAT_MODE || "mock"
      }
    });
  }

  if (pathname === "/api/wechat/pay/notify" && method === "POST") {
    const rawBody = await readText(req);
    const { transaction } = verifyAndDecryptNotification(req.headers, rawBody);
    if (transaction.trade_state === "SUCCESS") {
      const payment = db.prepare("SELECT * FROM payments WHERE payment_no = ?").get(transaction.out_trade_no);
      if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "微信支付单不存在");
      const paidAmount = Number(transaction.amount?.total || 0) / 100;
      markWechatPaymentSucceeded(db, payment.id, transaction.transaction_id, paidAmount);
    }
    return sendJson(res, 200, { code: "SUCCESS", message: "成功" });
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const clientKey = req.socket.remoteAddress || "unknown";
    enforceLoginRateLimit(clientKey);
    const body = await readJson(req);
    let user;
    try {
      user = loginWithPassword(db, body.username, body.password);
    } catch (error) {
      recordLoginFailure(clientKey);
      throw error;
    }
    loginAttempts.delete(clientKey);
    const token = createSession(db, user.id);
    return sendJson(res, 200, {
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: user.role,
          customerId: user.customer_id
        }
      }
    });
  }

  if (pathname === "/api/auth/dev-login" && method === "POST") {
    if ((process.env.WECHAT_MODE || "mock") !== "mock") {
      throw new HttpError(403, "DEV_LOGIN_DISABLED", "正式模式不允许手机号快捷登录");
    }
    const body = await readJson(req);
    const phone = cleanText(body.phone);
    const user = db.prepare(`
      SELECT * FROM users WHERE phone = ? AND role LIKE 'CUSTOMER_%' AND active = 1
    `).get(phone);
    if (!user) throw new HttpError(401, "CUSTOMER_NOT_FOUND", "该手机号尚未由后台开通客户账号");
    const token = createSession(db, user.id);
    return sendJson(res, 200, {
      data: {
        token,
        user: {
          id: user.id,
          displayName: user.display_name,
          phone: user.phone,
          role: user.role,
          customerId: user.customer_id
        },
        mode: "mock"
      }
    });
  }

  if (pathname === "/api/auth/wechat-login" && method === "POST") {
    if (isWechatMock()) {
      throw new HttpError(400, "WECHAT_MOCK_MODE", "测试环境请使用手机号快捷登录");
    }
    const body = await readJson(req);
    const session = await exchangeLoginCode(requireValue(body.code, "微信登录凭证"));
    const phone = await exchangePhoneCode(requireValue(body.phoneCode, "微信手机号授权凭证"));
    let user = db.prepare("SELECT * FROM users WHERE wechat_openid = ? AND active = 1").get(session.openid);
    if (!user) {
      user = db.prepare(`
        SELECT * FROM users WHERE phone = ? AND role LIKE 'CUSTOMER_%' AND active = 1
      `).get(phone);
      if (!user) throw new HttpError(401, "CUSTOMER_NOT_FOUND", "该微信手机号尚未由后台开通客户账号");
      const conflict = db.prepare("SELECT id FROM users WHERE wechat_openid = ? AND id != ?")
        .get(session.openid, user.id);
      if (conflict) throw new HttpError(409, "WECHAT_ACCOUNT_CONFLICT", "该微信身份已绑定其他客户账号");
      db.prepare("UPDATE users SET wechat_openid = ?, phone = ? WHERE id = ?")
        .run(session.openid, phone, user.id);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    }
    const token = createSession(db, user.id);
    return sendJson(res, 200, {
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
    });
  }

  const user = authenticate(req, db);
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "登录已失效，请重新登录");

  if (pathname === "/api/auth/logout" && method === "POST") {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return sendJson(res, 200, { data: { ok: true } });
  }

  if (pathname === "/api/auth/change-password" && method === "POST") {
    if (user.isCustomer) throw new HttpError(403, "FORBIDDEN", "客户账号使用微信授权登录");
    const body = await readJson(req);
    const current = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
    if (!verifyPassword(String(body.currentPassword || ""), current.password_hash)) {
      throw new HttpError(400, "CURRENT_PASSWORD_INVALID", "当前密码不正确");
    }
    const newPassword = requireText(body.newPassword, "新密码", 200);
    if (newPassword.length < 8) throw new HttpError(400, "WEAK_PASSWORD", "新密码至少8位");
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), user.id);
    const currentToken = (req.headers.authorization || "").slice(7);
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(user.id, currentToken);
    return sendJson(res, 200, { data: { ok: true } });
  }

  if (pathname === "/api/me" && method === "GET") {
    const data = { user };
    if (user.isCustomer) data.customer = getCustomerProfile(db, user.customerId);
    return sendJson(res, 200, { data });
  }

  if (pathname === "/api/notifications" && method === "GET") {
    return sendJson(res, 200, { data: listNotifications(db, user) });
  }
  let match = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (match && method === "POST") {
    db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?")
      .run(new Date().toISOString(), decodeURIComponent(match[1]), user.id);
    return sendJson(res, 200, { data: { ok: true } });
  }

  if (user.isCustomer) {
    return handleCustomerApi(req, res, url, db, user);
  }
  return handleAdminApi(req, res, url, db, user);
}

async function handleCustomerApi(req, res, url, db, user) {
  const method = req.method;
  const pathname = url.pathname;
  if (pathname === "/api/mobile/profile" && method === "GET") {
    return sendJson(res, 200, { data: getCustomerProfile(db, user.customerId) });
  }
  if (pathname === "/api/mobile/catalog" && method === "GET") {
    return sendJson(res, 200, {
      data: {
        products: productCatalog(db, user.customerId),
        customer: getCustomerProfile(db, user.customerId)
      }
    });
  }
  if (pathname === "/api/mobile/orders" && method === "GET") {
    return sendJson(res, 200, {
      data: listOrders(db, user, Object.fromEntries(url.searchParams))
    });
  }
  if (pathname === "/api/mobile/orders" && method === "POST") {
    return sendJson(res, 201, { data: createOrder(db, user, await readJson(req)) });
  }
  let match = pathname.match(/^\/api\/mobile\/orders\/([^/]+)$/);
  if (match && method === "GET") {
    return sendJson(res, 200, { data: getOrder(db, user, decodeURIComponent(match[1])) });
  }
  match = pathname.match(/^\/api\/mobile\/orders\/([^/]+)\/cancel$/);
  if (match && method === "POST") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: cancelOrder(db, user, decodeURIComponent(match[1]), body.reason)
    });
  }
  if (pathname === "/api/mobile/payments" && method === "POST") {
    return sendJson(res, 201, { data: await createPayment(db, user, await readJson(req)) });
  }
  match = pathname.match(/^\/api\/mobile\/payments\/([^/]+)\/mock-complete$/);
  if (match && method === "POST") {
    return sendJson(res, 200, { data: completeMockPayment(db, user, decodeURIComponent(match[1])) });
  }
  match = pathname.match(/^\/api\/mobile\/shipments\/([^/]+)\/receive$/);
  if (match && method === "POST") {
    return sendJson(res, 200, { data: receiveShipment(db, user, decodeURIComponent(match[1])) });
  }
  if (pathname === "/api/mobile/plans" && method === "GET") {
    return sendJson(res, 200, {
      data: listPlans(db, user, Object.fromEntries(url.searchParams))
    });
  }
  if (pathname === "/api/mobile/plans" && method === "POST") {
    return sendJson(res, 201, { data: createPlan(db, user, await readJson(req)) });
  }
  match = pathname.match(/^\/api\/mobile\/plans\/([^/]+)$/);
  if (match && method === "PUT") {
    return sendJson(res, 200, {
      data: updatePlan(db, user, decodeURIComponent(match[1]), await readJson(req))
    });
  }
  match = pathname.match(/^\/api\/mobile\/plans\/([^/]+)\/actions$/);
  if (match && method === "POST") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: planAction(db, user, decodeURIComponent(match[1]), body.action, body.note)
    });
  }
  if (pathname === "/api/mobile/after-sales" && method === "GET") {
    return sendJson(res, 200, { data: listAfterSales(db, user) });
  }
  if (pathname === "/api/mobile/after-sales" && method === "POST") {
    return sendJson(res, 201, { data: createAfterSalesCase(db, user, await readJson(req)) });
  }
  throw new HttpError(404, "NOT_FOUND", "接口不存在");
}

async function handleAdminApi(req, res, url, db, user) {
  requireStaff(user);
  const method = req.method;
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams);

  if (pathname === "/api/admin/dashboard" && method === "GET") {
    return sendJson(res, 200, { data: dashboard(db, user) });
  }
  if (pathname === "/api/admin/customers" && method === "GET") {
    requireRoles(user, ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_SALES", "SANLEI_FINANCE"]);
    return sendJson(res, 200, { data: listCustomers(db, query) });
  }
  if (pathname === "/api/admin/customers" && method === "POST") {
    return sendJson(res, 201, { data: saveCustomer(db, user, await readJson(req)) });
  }
  let match = pathname.match(/^\/api\/admin\/customers\/([^/]+)$/);
  if (match && method === "PUT") {
    return sendJson(res, 200, {
      data: saveCustomer(db, user, await readJson(req), decodeURIComponent(match[1]))
    });
  }
  match = pathname.match(/^\/api\/admin\/customers\/([^/]+)\/effective-prices$/);
  if (match && method === "GET") {
    requireRoles(user, ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_SALES", "SANLEI_FINANCE"]);
    return sendJson(res, 200, { data: previewEffectivePrices(db, decodeURIComponent(match[1])) });
  }
  match = pathname.match(/^\/api\/admin\/customers\/([^/]+)\/authorizations$/);
  if (match && method === "GET") {
    return sendJson(res, 200, { data: getCustomerAuthorizations(db, decodeURIComponent(match[1])) });
  }
  if (match && method === "PUT") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: setCustomerAuthorizations(db, user, decodeURIComponent(match[1]), body.vehicles)
    });
  }
  if (pathname === "/api/admin/products" && method === "GET") {
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE", "SANLEI_FINANCE"]);
    return sendJson(res, 200, { data: listProducts(db) });
  }
  if (pathname === "/api/admin/products" && method === "POST") {
    return sendJson(res, 201, { data: saveProduct(db, user, await readJson(req)) });
  }
  match = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (match && method === "PUT") {
    return sendJson(res, 200, {
      data: saveProduct(db, user, await readJson(req), decodeURIComponent(match[1]))
    });
  }
  if (pathname === "/api/admin/prices" && method === "GET") {
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
    return sendJson(res, 200, { data: getPriceMatrix(db) });
  }
  if (pathname === "/api/admin/prices" && method === "PUT") {
    return sendJson(res, 200, { data: setPrice(db, user, await readJson(req)) });
  }
  if (pathname === "/api/admin/inventory" && method === "GET") {
    return sendJson(res, 200, { data: listInventory(db, { ...query, user }) });
  }
  if (pathname === "/api/admin/inventory/transfer" && method === "POST") {
    return sendJson(res, 201, { data: transferInventory(db, user, await readJson(req)) });
  }
  if (pathname === "/api/admin/inventory/movements" && method === "GET") {
    return sendJson(res, 200, {
      data: listInventoryMovements(db, user, query.productId || "")
    });
  }
  match = pathname.match(/^\/api\/admin\/inventory\/([^/]+)\/adjust$/);
  if (match && method === "POST") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: adjustInventory(db, user, decodeURIComponent(match[1]), body.quantity, body.note)
    });
  }
  if (pathname === "/api/admin/suppliers" && method === "GET") {
    return sendJson(res, 200, { data: listSuppliers(db) });
  }
  if (pathname === "/api/admin/suppliers" && method === "POST") {
    return sendJson(res, 201, { data: saveSupplier(db, user, await readJson(req)) });
  }
  match = pathname.match(/^\/api\/admin\/suppliers\/([^/]+)$/);
  if (match && method === "PUT") {
    return sendJson(res, 200, {
      data: saveSupplier(db, user, await readJson(req), decodeURIComponent(match[1]))
    });
  }
  if (pathname === "/api/admin/orders" && method === "GET") {
    return sendJson(res, 200, { data: listOrders(db, user, query) });
  }
  match = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (match && method === "GET") {
    return sendJson(res, 200, { data: getOrder(db, user, decodeURIComponent(match[1])) });
  }
  match = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/actions$/);
  if (match && method === "POST") {
    const orderId = decodeURIComponent(match[1]);
    const body = await readJson(req);
    if (body.action === "BANGBANG_CONFIRM") {
      return sendJson(res, 200, { data: confirmOrder(db, user, orderId, body.note) });
    }
    if (body.action === "SANLEI_ACCEPT") {
      return sendJson(res, 200, { data: acceptOrder(db, user, orderId) });
    }
    if (body.action === "SHIP") {
      return sendJson(res, 200, { data: shipOrder(db, user, orderId, body.shipment || body) });
    }
    if (body.action === "CANCEL") {
      return sendJson(res, 200, { data: cancelOrder(db, user, orderId, body.reason) });
    }
    throw new HttpError(400, "INVALID_ORDER_ACTION", "订单操作无效");
  }
  if (pathname === "/api/admin/plans" && method === "GET") {
    return sendJson(res, 200, { data: listPlans(db, user, query) });
  }
  match = pathname.match(/^\/api\/admin\/plans\/([^/]+)\/actions$/);
  if (match && method === "POST") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: planAction(db, user, decodeURIComponent(match[1]), body.action, body.note)
    });
  }
  if (pathname === "/api/admin/payments" && method === "GET") {
    return sendJson(res, 200, { data: listPayments(db) });
  }
  if (pathname === "/api/admin/payments/mock" && method === "POST") {
    requireRoles(user, ["SUPER_ADMIN"]);
    if (!isWechatMock()) {
      throw new HttpError(403, "MOCK_PAYMENT_DISABLED", "正式支付模式不允许模拟到账");
    }
    const body = await readJson(req);
    const payment = await createPayment(db, user, {
      orderId: body.orderId,
      amount: body.amount
    });
    return sendJson(res, 200, { data: completeMockPayment(db, user, payment.id) });
  }
  if (pathname === "/api/admin/finance" && method === "GET") {
    return sendJson(res, 200, { data: listFinancialRecords(db, user) });
  }
  if (pathname === "/api/admin/finance/invoices" && method === "POST") {
    return sendJson(res, 201, { data: createInvoice(db, user, await readJson(req)) });
  }
  match = pathname.match(/^\/api\/admin\/finance\/invoices\/([^/]+)\/status$/);
  if (match && method === "POST") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: updateInvoiceStatus(db, user, decodeURIComponent(match[1]), body.status)
    });
  }
  if (pathname === "/api/admin/finance/freight" && method === "POST") {
    return sendJson(res, 201, { data: createFreight(db, user, await readJson(req)) });
  }
  if (pathname === "/api/admin/finance/adjustments" && method === "POST") {
    return sendJson(res, 201, { data: createAdjustment(db, user, await readJson(req)) });
  }
  match = pathname.match(/^\/api\/admin\/finance\/(freight|adjustment)\/([^/]+)\/settle$/);
  if (match && method === "POST") {
    return sendJson(res, 200, {
      data: settleFinancialRecord(db, user, match[1], decodeURIComponent(match[2]))
    });
  }
  if (pathname === "/api/admin/shortages" && method === "GET") {
    return sendJson(res, 200, { data: listShortageProducts(db, user) });
  }
  match = pathname.match(/^\/api\/admin\/shortages\/([^/]+)\/preview$/);
  if (match && method === "GET") {
    return sendJson(res, 200, {
      data: previewShortageAllocation(db, user, decodeURIComponent(match[1]))
    });
  }
  match = pathname.match(/^\/api\/admin\/shortages\/([^/]+)\/apply$/);
  if (match && method === "POST") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: applyShortageAllocation(db, user, decodeURIComponent(match[1]), body.targets)
    });
  }
  if (pathname === "/api/admin/after-sales" && method === "GET") {
    return sendJson(res, 200, { data: listAfterSales(db, user) });
  }
  match = pathname.match(/^\/api\/admin\/after-sales\/([^/]+)$/);
  if (match && method === "PUT") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: updateAfterSalesStatus(db, user, decodeURIComponent(match[1]), body.status, body.resolution)
    });
  }
  if (pathname === "/api/admin/reports/plan-execution" && method === "GET") {
    return sendJson(res, 200, { data: planExecutionReport(db, user) });
  }
  if (pathname === "/api/admin/users" && method === "GET") {
    requireRoles(user, ["SUPER_ADMIN", "BANGBANG_OPS"]);
    return sendJson(res, 200, { data: listUsers(db) });
  }
  if (pathname === "/api/admin/users/customer" && method === "POST") {
    return sendJson(res, 201, { data: createCustomerUser(db, user, await readJson(req)) });
  }
  if (pathname === "/api/admin/users/staff" && method === "POST") {
    return sendJson(res, 201, { data: createStaffUser(db, user, await readJson(req)) });
  }
  match = pathname.match(/^\/api\/admin\/users\/([^/]+)\/toggle$/);
  if (match && method === "POST") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      data: toggleUser(db, user, decodeURIComponent(match[1]), Boolean(body.active))
    });
  }
  if (pathname === "/api/admin/audit-logs" && method === "GET") {
    requireRoles(user, ["SUPER_ADMIN"]);
    return sendJson(res, 200, { data: getAuditLogs(db) });
  }
  match = pathname.match(/^\/api\/admin\/exports\/([^/]+)$/);
  if (match && method === "GET") {
    const result = exportData(db, decodeURIComponent(match[1]));
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`
    });
    res.end(result.content);
    return;
  }
  match = pathname.match(/^\/api\/admin\/exports\/([^/]+)\/xlsx$/);
  if (match && method === "GET") {
    const result = exportXlsx(db, decodeURIComponent(match[1]));
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`
    });
    res.end(result.buffer);
    return;
  }
  match = pathname.match(/^\/api\/admin\/import-templates\/([^/]+)$/);
  if (match && method === "GET") {
    const kind = decodeURIComponent(match[1]);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${kind}-template.csv`)}`
    });
    res.end(getTemplate(kind));
    return;
  }
  match = pathname.match(/^\/api\/admin\/import-templates\/([^/]+)\/xlsx$/);
  if (match && method === "GET") {
    const kind = decodeURIComponent(match[1]);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${kind}-template.xlsx`)}`
    });
    res.end(getXlsxTemplate(kind));
    return;
  }
  match = pathname.match(/^\/api\/admin\/imports\/([^/]+)$/);
  if (match && method === "POST") {
    const text = await readText(req);
    return sendJson(res, 200, { data: importData(db, user, decodeURIComponent(match[1]), text) });
  }
  match = pathname.match(/^\/api\/admin\/imports\/([^/]+)\/xlsx$/);
  if (match && method === "POST") {
    const body = await readJson(req);
    if (!body.fileBase64) throw new HttpError(400, "VALIDATION_ERROR", "缺少Excel文件内容");
    const buffer = Buffer.from(String(body.fileBase64), "base64");
    return sendJson(res, 200, {
      data: importXlsx(db, user, decodeURIComponent(match[1]), buffer)
    });
  }
  throw new HttpError(404, "NOT_FOUND", "接口不存在");
}

function listNotifications(db, user) {
  return db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100
  `).all(user.id).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    read: Boolean(row.read_at),
    readAt: row.read_at,
    createdAt: row.created_at
  }));
}

function authenticate(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return getUserFromToken(db, token);
}

async function readJson(req) {
  const text = await readText(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "请求内容不是有效JSON");
  }
}

function requireValue(value, field) {
  const text = cleanText(value, 500);
  if (!text) throw new HttpError(400, "VALIDATION_ERROR", `${field}不能为空`);
  return text;
}

function enforceLoginRateLimit(clientKey) {
  const now = Date.now();
  const record = loginAttempts.get(clientKey);
  if (!record || record.resetAt < now) {
    loginAttempts.set(clientKey, { count: 0, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  if (record.count >= 8) {
    throw new HttpError(429, "LOGIN_RATE_LIMITED", "登录失败次数过多，请15分钟后再试");
  }
}

function recordLoginFailure(clientKey) {
  const record = loginAttempts.get(clientKey) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  record.count += 1;
  loginAttempts.set(clientKey, record);
}

async function readText(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "BODY_TOO_LARGE", "上传内容超过4MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, error) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const status = error instanceof HttpError ? error.status : 500;
  const body = {
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: status === 500 ? "服务器处理失败" : error.message,
      details: error.details || null
    }
  };
  if (status === 500) console.error(error);
  sendJson(res, status, body);
}

function setCors(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    throw new HttpError(404, "NOT_FOUND", "页面不存在");
  }
  const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const resolved = path.resolve(ADMIN_ROOT, requested);
  if (!resolved.startsWith(`${ADMIN_ROOT}${path.sep}`) && resolved !== path.join(ADMIN_ROOT, "index.html")) {
    throw new HttpError(403, "FORBIDDEN", "禁止访问");
  }
  let filePath = resolved;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": `${contentType(filePath)}; charset=utf-8`,
      "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600"
    });
    if (req.method === "HEAD") res.end();
    else res.end(content);
  } catch {
    throw new HttpError(404, "NOT_FOUND", "页面不存在");
  }
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";
}
