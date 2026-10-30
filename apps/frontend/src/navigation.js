const navigation = [
  { group: "工作台" },
  { id: "dashboard", label: "经营概览", path: "/", roles: "*" },
  { group: "渠道与商品" },
  { id: "customers", label: "客户与渠道", path: "/customers", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_SALES", "SANLEI_FINANCE"] },
  { id: "products", label: "产品档案", path: "/products", roles: ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"] },
  { id: "prices", label: "价格体系", path: "/prices", roles: ["SUPER_ADMIN", "SANLEI_SALES"] },
  { group: "订货与履约" },
  { id: "plans", label: "月度计划", path: "/plans", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "SANLEI_SALES", "BANGBANG_FINANCE"] },
  { id: "orders", label: "订单中心", path: "/orders", roles: "*" },
  { id: "inventory", label: "库存管理", path: "/inventory", roles: ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"] },
  { id: "shortages", label: "缺货分配", path: "/shortages", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "SANLEI_SALES"] },
  { id: "suppliers", label: "供应商档案", path: "/suppliers", roles: ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"] },
  { group: "财务与服务" },
  { id: "payments", label: "收款对账", path: "/payments", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_FINANCE"] },
  { id: "finance", label: "财务结算", path: "/finance", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_FINANCE"] },
  { id: "after-sales", label: "售后服务", path: "/after-sales", roles: ["SUPER_ADMIN", "SANLEI_AFTERSALES", "SANLEI_SALES"] },
  { id: "reports", label: "计划执行", path: "/reports", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "SANLEI_SALES"] },
  { group: "系统" },
  { id: "users", label: "账号权限", path: "/users", roles: ["SUPER_ADMIN", "BANGBANG_OPS"] },
  { id: "audit-logs", label: "审计日志", path: "/audit-logs", roles: ["SUPER_ADMIN"] },
  { id: "imports", label: "导入与导出", path: "/imports", roles: ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE", "BANGBANG_OPS"] }
];

export function visibleNavigation(role) {
  const sections = [];
  let current = null;
  for (const item of navigation) {
    if (item.group) {
      current = { group: item.group, items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { group: "", items: [] };
      sections.push(current);
    }
    if (item.roles === "*" || (role && item.roles.includes(role))) {
      current.items.push(item);
    }
  }
  return sections.filter((section) => section.items.length > 0);
}
