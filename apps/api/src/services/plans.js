import { HttpError, parsePositiveInteger, requireRoles, serialNumber, cleanText, nowIso, id } from "../lib/core.js";
import { all, first, run, withTransaction } from "../lib/sql.js";
import { auditSql, notifySql } from "../lib/audit-sql.js";

function mapPlan(plan, items) {
  return {
    id: plan.id,
    planNo: plan.plan_no,
    customerId: plan.customer_id,
    customerName: plan.customer_name,
    grade: plan.grade,
    planMonth: plan.plan_month,
    status: plan.status,
    customerNote: plan.customer_note,
    bangbangNote: plan.bangbang_note,
    sanleiNote: plan.sanlei_note,
    submittedAt: plan.submitted_at,
    bangbangReviewedAt: plan.bangbang_reviewed_at,
    sanleiReviewedAt: plan.sanlei_reviewed_at,
    createdAt: plan.created_at,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    items
  };
}

export async function listPlans(db, user, query = {}) {
  const conditions = [];
  const params = [];
  if (user.isCustomer) {
    conditions.push("p.customer_id = ?");
    params.push(user.customerId);
  } else if (query.customerId) {
    conditions.push("p.customer_id = ?");
    params.push(query.customerId);
  }
  if (query.status) {
    conditions.push("p.status = ?");
    params.push(query.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const plans = await all(
    db.$client,
    `SELECT p.*, c.name AS customer_name, c.grade
     FROM plans p JOIN customers c ON c.id = p.customer_id
     ${where}
     ORDER BY p.plan_month DESC, p.created_at DESC
     LIMIT 300`,
    params
  );
  const result = [];
  for (const plan of plans) {
    const items = await all(
      db.$client,
      `SELECT pi.*, pr.sku, pr.name, pr.vehicle_model
       FROM plan_items pi JOIN products pr ON pr.id = pi.product_id
       WHERE pi.plan_id = ? ORDER BY pi.week_no, pr.name`,
      [plan.id]
    );
    result.push(
      mapPlan(
        plan,
        items.map((item) => ({
          id: item.id,
          weekNo: item.week_no,
          productId: item.product_id,
          sku: item.sku,
          name: item.name,
          vehicleModel: item.vehicle_model,
          quantity: item.quantity,
          orderedQuantity: item.ordered_quantity
        }))
      )
    );
  }
  return result;
}

export async function getPlan(db, user, planId) {
  return (await listPlans(db, user)).find((plan) => plan.id === planId) || null;
}

async function validatePlanItems(conn, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "采购计划至少需要一个产品");
  }
  for (const item of items) {
    const weekNo = parsePositiveInteger(item.weekNo, "计划周");
    if (weekNo > 6) throw new HttpError(400, "VALIDATION_ERROR", "计划周必须在1到6之间");
    const quantity = parsePositiveInteger(item.quantity, "计划数量");
    const product = await first(conn, "SELECT * FROM products WHERE id = ? AND active = 1", [item.productId]);
    if (!product) throw new HttpError(400, "PRODUCT_NOT_FOUND", "计划产品不存在");
    if (quantity % product.min_package !== 0) {
      throw new HttpError(400, "PACKAGE_QUANTITY", `${product.name}数量必须为${product.min_package}的倍数`);
    }
  }
}

async function insertPlanItems(conn, planId, items) {
  const merged = new Map();
  for (const item of items) {
    const key = `${item.weekNo}:${item.productId}`;
    merged.set(key, (merged.get(key) || 0) + Number(item.quantity));
  }
  for (const [key, quantity] of merged) {
    const [weekNo, productId] = key.split(":");
    await run(
      conn,
      `INSERT INTO plan_items (id, plan_id, week_no, product_id, quantity, ordered_quantity)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [id("planitem"), planId, Number(weekNo), productId, quantity]
    );
  }
}

export async function createPlan(db, user, payload) {
  const customerId = user.isCustomer ? user.customerId : payload.customerId;
  const planMonth = cleanText(payload.planMonth);
  if (!/^\d{4}-\d{2}$/.test(planMonth)) {
    throw new HttpError(400, "VALIDATION_ERROR", "计划月份格式应为YYYY-MM");
  }
  await validatePlanItems(db.$client, payload.items);
  const planId = await withTransaction(db, async (conn) => {
    const newPlanId = id("plan");
    const planNo = serialNumber("PLAN");
    const createdAt = nowIso();
    await run(
      conn,
      `INSERT INTO plans (id, plan_no, customer_id, plan_month, status, customer_note,
         bangbang_note, sanlei_note, submitted_at, bangbang_reviewed_at,
         sanlei_reviewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'DRAFT', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [newPlanId, planNo, customerId, planMonth, cleanText(payload.note, 1000), createdAt, createdAt]
    );
    await insertPlanItems(conn, newPlanId, payload.items);
    await auditSql(conn, user, "CREATE_PLAN", "PLAN", newPlanId, { planMonth });
    return newPlanId;
  });
  return (await listPlans(db, user)).find((plan) => plan.id === planId);
}

export async function updatePlan(db, user, planId, payload) {
  const plan = await first(db.$client, "SELECT * FROM plans WHERE id = ?", [planId]);
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "采购计划不存在");
  if (user.isCustomer && plan.customer_id !== user.customerId) {
    throw new HttpError(404, "PLAN_NOT_FOUND", "采购计划不存在");
  }
  if (!["DRAFT", "REJECTED"].includes(plan.status)) {
    throw new HttpError(409, "PLAN_CANNOT_EDIT", "审核中的计划请先撤回再修改");
  }
  await validatePlanItems(db.$client, payload.items);
  await withTransaction(db, async (conn) => {
    await run(
      conn,
      `UPDATE plans SET plan_month = ?, customer_note = ?, status = 'DRAFT',
         submitted_at = NULL, bangbang_reviewed_at = NULL, sanlei_reviewed_at = NULL,
         bangbang_note = NULL, sanlei_note = NULL, updated_at = ?
       WHERE id = ?`,
      [
        cleanText(payload.planMonth || plan.plan_month, 7),
        cleanText(payload.note ?? plan.customer_note, 1000),
        nowIso(),
        planId
      ]
    );
    await run(conn, "DELETE FROM plan_items WHERE plan_id = ?", [planId]);
    await insertPlanItems(conn, planId, payload.items);
    await auditSql(conn, user, "UPDATE_PLAN", "PLAN", planId);
  });
  return (await listPlans(db, user)).find((item) => item.id === planId);
}

export async function planAction(db, user, planId, action, note = "") {
  const plan = await first(db.$client, "SELECT * FROM plans WHERE id = ?", [planId]);
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "采购计划不存在");
  if (user.isCustomer && plan.customer_id !== user.customerId) {
    throw new HttpError(404, "PLAN_NOT_FOUND", "采购计划不存在");
  }
  let nextStatus = null;
  await withTransaction(db, async (conn) => {
    const timestamp = nowIso();
    if (action === "SUBMIT") {
      if (!["DRAFT", "REJECTED"].includes(plan.status)) {
        throw new HttpError(409, "INVALID_PLAN_STATUS", "当前计划不能提交");
      }
      nextStatus = "BANGBANG_REVIEW";
      await run(conn, "UPDATE plans SET status = ?, submitted_at = ?, updated_at = ? WHERE id = ?", [
        nextStatus,
        timestamp,
        timestamp,
        planId
      ]);
    } else if (action === "WITHDRAW") {
      if (!["BANGBANG_REVIEW", "SANLEI_REVIEW"].includes(plan.status)) {
        throw new HttpError(409, "INVALID_PLAN_STATUS", "当前计划不能撤回");
      }
      nextStatus = "DRAFT";
      await run(
        conn,
        `UPDATE plans SET status = 'DRAFT', submitted_at = NULL, bangbang_reviewed_at = NULL,
           sanlei_reviewed_at = NULL, bangbang_note = NULL, sanlei_note = NULL, updated_at = ?
         WHERE id = ?`,
        [timestamp, planId]
      );
    } else if (action === "BANGBANG_APPROVE") {
      requireRoles(user, ["BANGBANG_OPS", "SUPER_ADMIN"]);
      if (plan.status !== "BANGBANG_REVIEW") throw new HttpError(409, "INVALID_PLAN_STATUS", "计划不在邦邦审核阶段");
      nextStatus = "SANLEI_REVIEW";
      await run(
        conn,
        `UPDATE plans SET status = ?, bangbang_note = ?, bangbang_reviewed_at = ?, updated_at = ? WHERE id = ?`,
        [nextStatus, cleanText(note, 1000), timestamp, timestamp, planId]
      );
    } else if (action === "BANGBANG_REJECT") {
      requireRoles(user, ["BANGBANG_OPS", "SUPER_ADMIN"]);
      if (plan.status !== "BANGBANG_REVIEW") throw new HttpError(409, "INVALID_PLAN_STATUS", "计划不在邦邦审核阶段");
      nextStatus = "REJECTED";
      await run(
        conn,
        `UPDATE plans SET status = ?, bangbang_note = ?, bangbang_reviewed_at = ?, updated_at = ? WHERE id = ?`,
        [nextStatus, cleanText(note || "邦邦退回", 1000), timestamp, timestamp, planId]
      );
    } else if (action === "SANLEI_APPROVE") {
      requireRoles(user, ["SANLEI_SALES", "SUPER_ADMIN"]);
      if (plan.status !== "SANLEI_REVIEW") throw new HttpError(409, "INVALID_PLAN_STATUS", "计划不在三磊审核阶段");
      nextStatus = "APPROVED";
      await run(
        conn,
        `UPDATE plans SET status = ?, sanlei_note = ?, sanlei_reviewed_at = ?, updated_at = ? WHERE id = ?`,
        [nextStatus, cleanText(note, 1000), timestamp, timestamp, planId]
      );
    } else if (action === "SANLEI_REJECT") {
      requireRoles(user, ["SANLEI_SALES", "SUPER_ADMIN"]);
      if (plan.status !== "SANLEI_REVIEW") throw new HttpError(409, "INVALID_PLAN_STATUS", "计划不在三磊审核阶段");
      nextStatus = "REJECTED";
      await run(
        conn,
        `UPDATE plans SET status = ?, sanlei_note = ?, sanlei_reviewed_at = ?, updated_at = ? WHERE id = ?`,
        [nextStatus, cleanText(note || "三磊退回", 1000), timestamp, timestamp, planId]
      );
    } else {
      throw new HttpError(400, "INVALID_PLAN_ACTION", "计划操作无效");
    }
    await auditSql(conn, user, `PLAN_${action}`, "PLAN", planId, { nextStatus, note });
    if (plan.customer_id) {
      await notifySql(conn, plan.customer_id, "采购计划状态更新", `计划${plan.plan_no}：${nextStatus}`);
    }
  });
  return (await listPlans(db, user)).find((item) => item.id === planId);
}
