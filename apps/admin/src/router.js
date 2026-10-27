import { createRouter, createWebHistory } from "vue-router";
import { getToken } from "./api/client.js";
import AppLayout from "./layouts/AppLayout.vue";
import LoginView from "./views/LoginView.vue";
import DashboardView from "./views/DashboardView.vue";
import CustomersView from "./views/CustomersView.vue";
import ProductsView from "./views/ProductsView.vue";
import PricesView from "./views/PricesView.vue";
import SuppliersView from "./views/SuppliersView.vue";
import ReportsView from "./views/ReportsView.vue";
import PaymentsView from "./views/PaymentsView.vue";
import OrdersView from "./views/OrdersView.vue";
import PlansView from "./views/PlansView.vue";
import InventoryView from "./views/InventoryView.vue";
import ShortagesView from "./views/ShortagesView.vue";
import FinanceView from "./views/FinanceView.vue";
import AfterSalesView from "./views/AfterSalesView.vue";
import UsersView from "./views/UsersView.vue";
import ImportsView from "./views/ImportsView.vue";

const routes = [
  { path: "/login", name: "login", component: LoginView, meta: { public: true } },
  {
    path: "/",
    component: AppLayout,
    children: [
      { path: "", name: "dashboard", component: DashboardView, meta: { title: "经营概览" } },
      { path: "customers", name: "customers", component: CustomersView, meta: { title: "客户与渠道" } },
      { path: "products", name: "products", component: ProductsView, meta: { title: "产品档案" } },
      { path: "prices", name: "prices", component: PricesView, meta: { title: "价格体系" } },
      { path: "suppliers", name: "suppliers", component: SuppliersView, meta: { title: "供应商档案" } },
      { path: "orders", name: "orders", component: OrdersView, meta: { title: "订单中心" } },
      { path: "plans", name: "plans", component: PlansView, meta: { title: "月度计划" } },
      { path: "inventory", name: "inventory", component: InventoryView, meta: { title: "库存管理" } },
      { path: "shortages", name: "shortages", component: ShortagesView, meta: { title: "缺货分配" } },
      { path: "payments", name: "payments", component: PaymentsView, meta: { title: "收款对账" } },
      { path: "finance", name: "finance", component: FinanceView, meta: { title: "财务结算" } },
      { path: "after-sales", name: "after-sales", component: AfterSalesView, meta: { title: "售后服务" } },
      { path: "reports", name: "reports", component: ReportsView, meta: { title: "计划执行" } },
      { path: "users", name: "users", component: UsersView, meta: { title: "账号权限" } },
      { path: "imports", name: "imports", component: ImportsView, meta: { title: "导入与导出" } }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  if (!to.meta.public && !getToken()) return { name: "login" };
  if (to.name === "login" && getToken()) return { name: "dashboard" };
  return true;
});

export default router;
