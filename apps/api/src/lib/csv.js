import { HttpError } from "./core.js";
import { writeWorkbookRows } from "./xlsx.js";

export const TEMPLATES = {
  customers: [
    "客户编码", "客户名称", "省份", "城市", "渠道类型", "客户等级", "价格等级",
    "结算方式", "账期天数", "授信额度", "预付款比例", "最多发货批次", "手机号", "地址"
  ],
  products: [
    "物料号", "品名", "分类", "车型", "最小包装", "基础价", "质保月数", "质保公里", "说明"
  ],
  prices: ["范围", "价格等级或客户编码", "物料号", "价格"],
  inventory: ["物料号", "仓库名称", "库存类型", "数量", "供应商名称"]
};

export function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function toCsv(headers, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")}`;
}

export function getTemplate(kind) {
  if (!TEMPLATES[kind]) throw new HttpError(404, "TEMPLATE_NOT_FOUND", "导入模板不存在");
  return toCsv(TEMPLATES[kind], []);
}

export function getXlsxTemplate(kind) {
  if (!TEMPLATES[kind]) throw new HttpError(404, "TEMPLATE_NOT_FOUND", "导入模板不存在");
  return writeWorkbookRows(TEMPLATES[kind], [], templateName(kind));
}

export function templateName(kind) {
  return {
    customers: "客户档案",
    products: "产品档案",
    prices: "价格矩阵",
    inventory: "期初库存"
  }[kind] || "导入模板";
}
