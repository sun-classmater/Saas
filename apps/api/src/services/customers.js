import { and, desc, eq, like, or } from "drizzle-orm";
import { customerVehicleAuthorizations, customers, orders, products } from "@saas/db/schema";
import { asBoolean, cleanText, HttpError, id, isDuplicateEntry, money, nowIso, requireText } from "../lib/core.js";
import { audit } from "./audit.js";

const CHANNEL_TYPES = new Set(["WHOLESALER", "4S_GROUP", "CHAIN"]);
const SETTLEMENT_METHODS = new Set(["CREDIT", "PREPAY"]);

export async function customerOutstanding(db, customerId) {
  const rows = await db
    .select({
      totalAmount: orders.totalAmount,
      paidAmount: orders.paidAmount,
      settlementMethod: orders.settlementMethod,
      status: orders.status
    })
    .from(orders)
    .where(eq(orders.customerId, customerId));
  const outstanding = rows.reduce((sum, row) => {
    if (row.settlementMethod !== "CREDIT") return sum;
    if (row.status === "COMPLETED" || row.status === "CANCELLED") return sum;
    return sum + Number(row.totalAmount) - Number(row.paidAmount);
  }, 0);
  return money(outstanding);
}

export function mapCustomer(customer, outstanding = 0) {
  if (!customer) return null;
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    province: customer.province,
    city: customer.city,
    channelType: customer.channelType,
    grade: customer.grade,
    priceTier: customer.priceTier,
    settlementMethod: customer.settlementMethod,
    paymentTermsDays: customer.paymentTermsDays,
    creditLimit: money(customer.creditLimit),
    creditOutstanding: outstanding,
    prepayRatio: Number(customer.prepayRatio),
    batchLimit: customer.batchLimit,
    allowOverpayment: asBoolean(customer.allowOverpayment),
    phone: customer.phone,
    address: customer.address,
    active: asBoolean(customer.active),
    notes: customer.notes,
    createdAt: customer.createdAt
  };
}

export async function getCustomerProfile(db, customerId) {
  if (!customerId) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return null;
  return mapCustomer(customer, await customerOutstanding(db, customerId));
}

export async function listCustomers(db, query = {}) {
  const conditions = [];
  if (query.keyword) {
    const keyword = `%${cleanText(query.keyword)}%`;
    conditions.push(or(like(customers.name, keyword), like(customers.code, keyword), like(customers.phone, keyword)));
  }
  if (query.active !== undefined && query.active !== "") {
    conditions.push(eq(customers.active, query.active === "true" || query.active === "1" ? 1 : 0));
  }
  const rows = await db
    .select()
    .from(customers)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(customers.active), desc(customers.createdAt));
  return Promise.all(rows.map(async (customer) => mapCustomer(customer, await customerOutstanding(db, customer.id))));
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field}必须为非负整数`);
  }
  return number;
}

function nonNegativeNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field}必须为非负数`);
  }
  return number;
}

function ratio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1) {
    throw new HttpError(400, "VALIDATION_ERROR", "预付款比例必须大于0且不超过1");
  }
  return Math.round(number * 10000) / 10000;
}

export async function saveCustomer(db, user, payload, customerId = null) {
  const existing = customerId
    ? (await db.select().from(customers).where(eq(customers.id, customerId)).limit(1))[0]
    : null;
  if (customerId && !existing) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const channelType = cleanText(payload.channelType || existing?.channelType || "WHOLESALER").toUpperCase();
  const settlementMethod = cleanText(payload.settlementMethod || existing?.settlementMethod || "CREDIT").toUpperCase();
  if (!CHANNEL_TYPES.has(channelType)) throw new HttpError(400, "VALIDATION_ERROR", "渠道类型无效");
  if (!SETTLEMENT_METHODS.has(settlementMethod)) throw new HttpError(400, "VALIDATION_ERROR", "结算方式无效");

  const values = {
    code: requireText(payload.code ?? existing?.code, "客户编码"),
    name: requireText(payload.name ?? existing?.name, "客户名称"),
    province: cleanText(payload.province ?? existing?.province, 50),
    city: cleanText(payload.city ?? existing?.city, 50),
    channelType,
    grade: requireText(payload.grade ?? existing?.grade, "客户等级", 20),
    priceTier: requireText(payload.priceTier ?? existing?.priceTier, "价格等级", 20),
    settlementMethod,
    paymentTermsDays: nonNegativeInteger(payload.paymentTermsDays ?? existing?.paymentTermsDays ?? 0, "账期天数"),
    creditLimit: nonNegativeNumber(payload.creditLimit ?? existing?.creditLimit ?? 0, "信用额度"),
    prepayRatio: ratio(payload.prepayRatio ?? existing?.prepayRatio ?? 1),
    batchLimit: Number(payload.batchLimit ?? existing?.batchLimit ?? 3),
    allowOverpayment: payload.allowOverpayment === true || payload.allowOverpayment === 1 ? 1 : 0,
    phone: cleanText(payload.phone ?? existing?.phone, 30),
    address: cleanText(payload.address ?? existing?.address, 500),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
    notes: cleanText(payload.notes ?? existing?.notes, 1000)
  };
  if (!Number.isInteger(values.batchLimit) || values.batchLimit <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "最多发货批次必须为正整数");
  }
  if (values.batchLimit > 20) throw new HttpError(400, "VALIDATION_ERROR", "最多发货批次不能超过20");

  try {
    if (existing) {
      await db.update(customers).set(values).where(eq(customers.id, customerId));
      await audit(db, user, "UPDATE_CUSTOMER", "CUSTOMER", customerId, values);
    } else {
      customerId = id("cust");
      await db.insert(customers).values({ id: customerId, ...values, createdAt: nowIso() });
      await audit(db, user, "CREATE_CUSTOMER", "CUSTOMER", customerId, values);
    }
  } catch (error) {
    if (isDuplicateEntry(error)) {
      throw new HttpError(409, "CUSTOMER_CODE_EXISTS", "客户编码已存在");
    }
    throw error;
  }
  return getCustomerProfile(db, customerId);
}

export async function getCustomerAuthorizations(db, customerId) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const vehicleRows = await db
    .selectDistinct({ vehicleModel: products.vehicleModel })
    .from(products)
    .where(eq(products.active, 1))
    .orderBy(products.vehicleModel);
  return {
    customerId,
    province: customer.province,
    city: customer.city,
    allVehicles: vehicleRows.map((row) => row.vehicleModel),
    authorizedVehicles: await authorizedVehicles(db, customerId)
  };
}

async function authorizedVehicles(db, customerId) {
  const rows = await db
    .select({ vehicleModel: customerVehicleAuthorizations.vehicleModel })
    .from(customerVehicleAuthorizations)
    .where(and(eq(customerVehicleAuthorizations.customerId, customerId), eq(customerVehicleAuthorizations.active, 1)))
    .orderBy(customerVehicleAuthorizations.vehicleModel);
  return rows.map((row) => row.vehicleModel);
}

export async function setCustomerAuthorizations(db, user, customerId, vehicles) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "至少授权一个车型");
  }
  const validRows = await db.selectDistinct({ vehicleModel: products.vehicleModel }).from(products).where(eq(products.active, 1));
  const validVehicles = new Set(validRows.map((row) => row.vehicleModel));
  for (const vehicle of vehicles) {
    if (!validVehicles.has(vehicle)) throw new HttpError(400, "INVALID_VEHICLE_MODEL", `车型${vehicle}不存在`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(customerVehicleAuthorizations)
      .set({ active: 0 })
      .where(eq(customerVehicleAuthorizations.customerId, customerId));
    for (const vehicle of [...new Set(vehicles)]) {
      await tx
        .insert(customerVehicleAuthorizations)
        .values({
          id: id("auth"),
          customerId,
          vehicleModel: vehicle,
          province: customer.province,
          city: customer.city,
          active: 1,
          createdAt: nowIso()
        })
        .onDuplicateKeyUpdate({ set: { active: 1 } });
    }
    await audit(tx, user, "SET_VEHICLE_AUTH", "CUSTOMER", customerId, { vehicles });
  });
  return {
    customerId,
    province: customer.province,
    city: customer.city,
    allVehicles: [...validVehicles].sort(),
    authorizedVehicles: await authorizedVehicles(db, customerId)
  };
}
