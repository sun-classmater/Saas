export const statusNames = {
  DRAFT: "草稿",
  BANGBANG_REVIEW: "邦邦审核",
  SANLEI_REVIEW: "三磊审核",
  APPROVED: "已审核",
  REJECTED: "已退回",
  PENDING_BANGBANG: "待邦邦确认",
  PENDING_PAYMENT: "待付款",
  PARTIALLY_PAID: "部分付款",
  PENDING_SANLEI: "待接单",
  PREPARING: "备货中",
  BACKORDER: "缺货待补",
  PARTIALLY_SHIPPED: "部分发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  PENDING: "待支付",
  SUCCEEDED: "已支付",
  RECEIVED: "已签收",
  OPEN: "待处理",
  REVIEWING: "处理中",
  CLOSED: "已关闭",
  NORMAL: "正常订单",
  PREPAY: "预付款订单",
  NEW_PRODUCT: "新产品开发单",
  PLAN: "计划订单",
  TEMPORARY: "临时订货",
  CREDIT: "账期",
  WECHAT: "微信支付",
  WHOLESALER: "批发商",
  "4S_GROUP": "4S集团",
  CHAIN: "连锁",
  REAL: "真实库存",
  VIRTUAL: "虚拟库存",
  RETURN: "退货",
  CLAIM: "索赔",
  WRONG_ITEM: "发错货",
  REPLACEMENT: "更换",
  MARKET_FEEDBACK: "市场反馈",
  ADMIN: "管理员",
  DELIVERY: "送货上门",
  PICKUP: "客户自提",
  ISSUED: "已开票",
  SETTLED: "已结算",
  UNPAID: "未结算",
  FACTORY: "工厂直供",
  INTEGRATOR: "集成供应商",
  OTHER: "其他"
};

const tagTypes = {
  APPROVED: "success",
  COMPLETED: "success",
  SUCCEEDED: "success",
  RECEIVED: "success",
  ISSUED: "success",
  SETTLED: "success",
  REJECTED: "danger",
  CANCELLED: "danger",
  FAILED: "danger",
  OPEN: "warning",
  BANGBANG_REVIEW: "warning",
  SANLEI_REVIEW: "warning",
  PENDING_BANGBANG: "warning",
  PENDING_PAYMENT: "warning",
  PARTIALLY_PAID: "warning",
  PENDING: "warning",
  PREPARING: "info",
  SHIPPED: "info",
  PENDING_SANLEI: "info",
  PARTIALLY_SHIPPED: "warning",
  BACKORDER: "danger",
  REVIEWING: "warning"
};

export function name(value) {
  return statusNames[value] || value || "—";
}

export function tagType(value) {
  return tagTypes[value] || "info";
}

export function formatMoney(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}
