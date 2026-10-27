const statusNames = {
  DRAFT: "草稿",
  BANGBANG_REVIEW: "邦邦审核",
  SANLEI_REVIEW: "三磊审核",
  APPROVED: "已生效",
  REJECTED: "已退回",
  PENDING_BANGBANG: "待确认",
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
  NORMAL: "正常订单",
  PREPAY: "预付款订单",
  NEW_PRODUCT: "新产品开发单",
  PLAN: "计划订单",
  TEMPORARY: "临时订货",
  CREDIT: "账期",
  OPEN: "待处理",
  REVIEWING: "处理中",
  CLOSED: "已关闭",
  CLAIM: "索赔",
  RETURN: "退货",
  WRONG_ITEM: "发错货",
  REPLACEMENT: "换货",
  MARKET_FEEDBACK: "质量反馈"
};

function formatMoney(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusClass(status) {
  if (["APPROVED", "COMPLETED", "SUCCEEDED", "RECEIVED"].includes(status)) return "chip-success";
  if (["REJECTED", "CANCELLED", "BACKORDER"].includes(status)) return "chip-danger";
  if (["PENDING_BANGBANG", "PENDING_PAYMENT", "PARTIALLY_PAID", "BANGBANG_REVIEW", "SANLEI_REVIEW", "OPEN", "PENDING"].includes(status)) return "chip-warning";
  if (["PENDING_SANLEI", "PREPARING", "SHIPPED", "PARTIALLY_SHIPPED"].includes(status)) return "chip-info";
  return "";
}

module.exports = { statusNames, formatMoney, formatDate, statusClass };
