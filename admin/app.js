const TOKEN_KEY = "chelinhui_admin_token";
const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  user: null,
  route: "dashboard",
  modalHandler: null,
  customers: [],
  products: [],
  pendingDetail: null
};

const roleNames = {
  SUPER_ADMIN: "系统管理员",
  BANGBANG_OPS: "邦邦运营",
  BANGBANG_FINANCE: "邦邦财务",
  SANLEI_SALES: "三磊内勤",
  SANLEI_WAREHOUSE: "三磊仓库",
  SANLEI_FINANCE: "三磊财务",
  SANLEI_AFTERSALES: "三磊售后",
  CUSTOMER_ADMIN: "客户管理员",
  CUSTOMER_BUYER: "客户采购员"
};

const statusNames = {
  DRAFT: "草稿",
  BANGBANG_REVIEW: "邦邦审核",
  SANLEI_REVIEW: "三磊审核",
  APPROVED: "已审核",
  REJECTED: "已退回",
  PENDING_BANGBANG: "待邦邦确认",
  PENDING_PAYMENT: "待付款",
  PARTIALLY_PAID: "部分付款",
  PENDING_SANLEI: "待三磊接单",
  PREPARING: "备货中",
  BACKORDER: "缺货待补",
  PARTIALLY_SHIPPED: "部分发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  PENDING: "待支付",
  SUCCEEDED: "已支付",
  FAILED: "支付失败",
  SHIPPED_STATUS: "已发货",
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
  PICKUP: "客户自提"
};

const statusClasses = {
  APPROVED: "success",
  COMPLETED: "success",
  SUCCEEDED: "success",
  RECEIVED: "success",
  REJECTED: "danger",
  CANCELLED: "danger",
  FAILED: "danger",
  OPEN: "warning",
  BANGBANG_REVIEW: "warning",
  SANLEI_REVIEW: "review warning",
  PENDING_BANGBANG: "warning",
  PENDING_PAYMENT: "warning",
  PARTIALLY_PAID: "partial warning",
  PENDING: "warning",
  PREPARING: "info",
  SHIPPED: "info",
  PENDING_SANLEI: "info",
  PARTIALLY_SHIPPED: "partial warning",
  BACKORDER: "danger"
};

const navigation = [
  { group: "工作台" },
  { id: "dashboard", label: "经营概览", icon: "⌂", roles: "*" },
  { group: "渠道与商品" },
  { id: "customers", label: "客户与渠道", icon: "◎", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_SALES", "SANLEI_FINANCE"] },
  { id: "products", label: "产品档案", icon: "◇", roles: ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"] },
  { id: "prices", label: "价格体系", icon: "¥", roles: ["SUPER_ADMIN", "SANLEI_SALES"] },
  { group: "订货与履约" },
  { id: "plans", label: "月度计划", icon: "▦", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "SANLEI_SALES", "BANGBANG_FINANCE"] },
  { id: "orders", label: "订单中心", icon: "▤", roles: "*" },
  { id: "inventory", label: "库存管理", icon: "▥", roles: ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"] },
  { id: "shortages", label: "缺货分配", icon: "⇶", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "SANLEI_SALES"] },
  { id: "suppliers", label: "供应商档案", icon: "⌂", roles: ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"] },
  { group: "财务与服务" },
  { id: "payments", label: "收款对账", icon: "◫", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_FINANCE"] },
  { id: "finance", label: "财务结算", icon: "▧", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_FINANCE"] },
  { id: "after-sales", label: "售后服务", icon: "✚", roles: ["SUPER_ADMIN", "SANLEI_AFTERSALES", "SANLEI_SALES"] },
  { id: "reports", label: "计划执行", icon: "◒", roles: ["SUPER_ADMIN", "BANGBANG_OPS", "SANLEI_SALES"] },
  { group: "系统" },
  { id: "users", label: "账号权限", icon: "♙", roles: ["SUPER_ADMIN", "BANGBANG_OPS"] },
  { id: "imports", label: "导入与导出", icon: "⇄", roles: ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE", "BANGBANG_OPS"] }
];

const pageMeta = {
  dashboard: ["OPERATIONS", "经营概览"],
  customers: ["CHANNEL ACCOUNTS", "客户与渠道"],
  products: ["PRODUCT MASTER", "产品档案"],
  prices: ["PRICE GOVERNANCE", "价格体系"],
  plans: ["DEMAND PLAN", "月度采购计划"],
  orders: ["ORDER CONTROL", "订单中心"],
  inventory: ["STOCK CONTROL", "库存管理"],
  shortages: ["FAIR ALLOCATION", "缺货公平分配"],
  suppliers: ["SUPPLY NETWORK", "供应商档案"],
  payments: ["RECEIVABLES", "收款对账"],
  finance: ["SETTLEMENT", "财务结算"],
  "after-sales": ["SERVICE DESK", "售后服务"],
  reports: ["PLAN PERFORMANCE", "计划执行"],
  users: ["ACCESS CONTROL", "账号权限"],
  imports: ["DATA EXCHANGE", "导入与导出"]
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindGlobalEvents();
  if (state.token) {
    try {
      const result = await api("/api/me");
      state.user = result.user;
      showApp();
      return;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      state.token = "";
    }
  }
  showLogin();
}

function bindGlobalEvents() {
  $("#login-form").addEventListener("submit", handleLogin);
  $$("[data-demo-user]").forEach((button) => {
    button.addEventListener("click", () => {
      $('[name="username"]').value = button.dataset.demoUser;
      $('[name="password"]').value = "Admin@123";
    });
  });
  $("#change-password-button").addEventListener("click", openPasswordModal);
  $("#logout-button").addEventListener("click", logout);
  $("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
  $("#notification-button").addEventListener("click", showNotifications);
  $("#modal-form").addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") {
      closeModal();
      return;
    }
    event.preventDefault();
    if (!state.modalHandler) {
      closeModal();
      return;
    }
    const submitButton = $("#modal-submit");
    const errorElement = $("#modal-error");
    errorElement.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = "处理中…";
    try {
      const result = await state.modalHandler(new FormData(event.currentTarget));
      if (result !== false) closeModal();
    } catch (error) {
      errorElement.textContent = error.message;
      errorElement.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "确认";
    }
  });
  $("#modal").addEventListener("close", () => {
    if (!$("#modal").open) state.modalHandler = null;
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const errorElement = $("#login-error");
  errorElement.hidden = true;
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { username: form.get("username"), password: form.get("password") },
      noAuth: true
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(TOKEN_KEY, data.token);
    showApp();
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  } finally {
    button.disabled = false;
  }
}

function showLogin() {
  $("#login-view").hidden = false;
  $("#app-view").hidden = true;
}

function showApp() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#user-name").textContent = state.user.displayName;
  $("#user-role").textContent = roleNames[state.user.role] || state.user.role;
  $("#user-avatar").textContent = (state.user.displayName || "管").slice(0, 1);
  renderNavigation();
  navigate("dashboard");
  loadNotificationsHint();
}

async function logout() {
  if (state.token) {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      // Local session is cleared even if the server is temporarily unavailable.
    }
  }
  localStorage.removeItem(TOKEN_KEY);
  state.token = "";
  state.user = null;
  closeModal();
  showLogin();
}

function openPasswordModal() {
  openModal("修改登录密码", `
    <div class="form-grid">
      ${field("当前密码", "currentPassword", "", "password", true)}
      ${field("新密码", "newPassword", "", "password", true, "至少8位")}
      ${field("确认新密码", "confirmPassword", "", "password", true)}
    </div>
    <div class="callout">修改后，该账号在其他设备上的登录会失效。</div>
  `, async (form) => {
    if (form.get("newPassword") !== form.get("confirmPassword")) {
      throw new Error("两次输入的新密码不一致");
    }
    await api("/api/auth/change-password", {
      method: "POST",
      body: {
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword")
      }
    });
    toast("密码已修改");
  }, "保存新密码");
}

function renderNavigation() {
  const visible = navigation.filter((item) => !item.group && (item.roles === "*" || item.roles.includes(state.user.role)));
  $("#main-nav").innerHTML = navigation.map((item) => {
    if (item.group) return `<div class="nav-section">${escapeHtml(item.group)}</div>`;
    if (!visible.includes(item)) return "";
    return `
      <button class="nav-item ${item.id === state.route ? "active" : ""}" data-route="${item.id}">
        <span>${item.icon}</span><span>${escapeHtml(item.label)}</span>
      </button>
    `;
  }).join("");
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      $(".sidebar").classList.remove("open");
      navigate(button.dataset.route);
    });
  });
}

async function navigate(route) {
  state.route = route;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.route === route));
  const meta = pageMeta[route] || ["OPERATIONS", route];
  $("#page-eyebrow").textContent = meta[0];
  $("#page-title").textContent = meta[1];
  $("#page-content").innerHTML = loadingHtml();
  try {
    if (route === "dashboard") await renderDashboard();
    if (route === "customers") await renderCustomers();
    if (route === "products") await renderProducts();
    if (route === "prices") await renderPrices();
    if (route === "plans") await renderPlans();
    if (route === "orders") await renderOrders();
    if (route === "inventory") await renderInventory();
    if (route === "shortages") await renderShortages();
    if (route === "suppliers") await renderSuppliers();
    if (route === "payments") await renderPayments();
    if (route === "finance") await renderFinance();
    if (route === "after-sales") await renderAfterSales();
    if (route === "reports") await renderReports();
    if (route === "users") await renderUsers();
    if (route === "imports") renderImports();
  } catch (error) {
    $("#page-content").innerHTML = errorStateHtml(error.message);
  }
}

async function renderDashboard() {
  const data = await api("/api/admin/dashboard");
  const tasks = [
    ["待邦邦确认", data.metrics.pendingConfirm, "检查客户订单并确认收款方式", "orders"],
    ["预付款待收", data.metrics.pendingPayment, `${data.metrics.overduePrepay} 单超过3天未补齐`, "orders"],
    ["计划待审核", data.metrics.pendingPlan, "邦邦与三磊接力审核", "plans"],
    ["履约进行中", data.metrics.preparing, "接单、备货与分批发货", "orders"]
  ];
  $("#page-content").innerHTML = `
    <div class="metrics-grid">
      ${metricCard("本月订单金额", formatMoney(data.metrics.monthAmount), "当前自然月累计", "navy")}
      ${metricCard("待确认订单", data.metrics.pendingConfirm, "客户已提交，等待邦邦", "orange")}
      ${metricCard("履约进行中", data.metrics.preparing, "三磊正在处理", "")}
      ${metricCard("超期预付款", data.metrics.overduePrepay, "需优先催收", "red")}
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head">
          <div><h2>今日业务队列</h2><p>按实际角色处理待办，避免订单遗忘</p></div>
          <button class="button ghost small" data-go="orders">查看全部</button>
        </div>
        <div class="task-list">
          ${tasks.map(([title, count, sub, route]) => `
            <div class="task-item">
              <span class="task-icon">${count > 0 ? "!" : "✓"}</span>
              <div class="task-copy"><strong>${title}</strong><span>${sub}</span></div>
              <strong>${count}</strong>
              <button class="text-action" data-go="${route}">进入</button>
            </div>
          `).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>真实库存预警</h2><p>可用量不高于20</p></div></div>
        <div class="stock-list">
          ${data.lowStock.length ? data.lowStock.map((item) => `
            <div class="stock-row">
              <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.sku)}</small></div>
              <span class="stock-number">${item.available}</span>
            </div>
          `).join("") : `<div class="empty-state"><strong>库存充足</strong>暂无低库存产品</div>`}
        </div>
      </section>
    </div>
    <section class="panel" style="margin-top:18px">
      <div class="panel-head">
        <div><h2>最近订单</h2><p>最新提交的渠道订货单</p></div>
        <button class="button ghost small" data-go="orders">订单中心</button>
      </div>
      ${ordersTableHtml(data.recentOrders)}
    </section>
  `;
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
  bindOrderLinks();
}

async function renderCustomers() {
  state.customers = await api("/api/admin/customers");
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="search-box"><input id="customer-search" placeholder="搜索客户名称、编码或手机号"></div>
      <div class="toolbar-actions">
        <button class="button ghost" id="export-customers">导出客户</button>
        <button class="button primary" id="add-customer">+ 新建客户</button>
      </div>
    </div>
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>客户</th><th>区域 / 渠道</th><th>等级 / 价格</th><th>结算规则</th><th>授信占用</th><th>状态</th><th>操作</th></tr></thead>
          <tbody id="customer-table-body">${customersTableRows(state.customers)}</tbody>
        </table>
      </div>
      <div class="pagination-note">共 ${state.customers.length} 个客户</div>
    </section>
  `;
  $("#add-customer").addEventListener("click", () => openCustomerModal());
  $("#export-customers").addEventListener("click", () => toast("客户数据请通过“导入与导出”页面获取模板或导出订单"));
  $("#customer-search").addEventListener("input", (event) => {
    const keyword = event.target.value.trim().toLowerCase();
    const filtered = state.customers.filter((customer) =>
      [customer.name, customer.code, customer.phone].some((value) => String(value || "").toLowerCase().includes(keyword))
    );
    $("#customer-table-body").innerHTML = customersTableRows(filtered);
    bindCustomerRows();
  });
  bindCustomerRows();
}

function customersTableRows(customers) {
  if (!customers.length) return `<tr><td colspan="7">${emptyHtml("没有匹配的客户")}</td></tr>`;
  return customers.map((customer) => `
    <tr>
      <td><div class="cell-title">${escapeHtml(customer.name)}</div><div class="cell-sub">${escapeHtml(customer.code)} · ${escapeHtml(customer.phone || "未绑定手机")}</div></td>
      <td>${escapeHtml(`${customer.province || ""}${customer.city || ""}`)}<div class="cell-sub">${statusNames[customer.channelType] || customer.channelType}</div></td>
      <td><strong>${escapeHtml(customer.grade)}</strong><div class="cell-sub">${escapeHtml(customer.priceTier)} 价格等级</div></td>
      <td>${statusNames[customer.settlementMethod] || customer.settlementMethod}<div class="cell-sub">${customer.settlementMethod === "CREDIT" ? `${customer.paymentTermsDays}天账期` : `预付${Math.round(customer.prepayRatio * 100)}%`} · 最多${customer.batchLimit}批</div></td>
      <td class="money">${formatMoney(customer.creditOutstanding)}<div class="cell-sub">额度 ${formatMoney(customer.creditLimit)}</div></td>
      <td>${statusBadge(customer.active ? "APPROVED" : "CANCELLED", customer.active ? "启用" : "停用")}</td>
      <td><button class="text-action" data-edit-customer="${customer.id}">编辑</button><button class="text-action" data-price-customer="${customer.id}">看价格</button><button class="text-action" data-auth-customer="${customer.id}">车型授权</button></td>
    </tr>
  `).join("");
}

function bindCustomerRows() {
  $$("[data-edit-customer]").forEach((button) => button.addEventListener("click", () => {
    const customer = state.customers.find((item) => item.id === button.dataset.editCustomer);
    openCustomerModal(customer);
  }));
  $$("[data-price-customer]").forEach((button) => button.addEventListener("click", async () => {
    try {
      const prices = await api(`/api/admin/customers/${button.dataset.priceCustomer}/effective-prices`);
      openModal("客户生效价格", `
        <div class="callout">这里展示该客户当前实际可见价格，优先级为：客户专属价 &gt; 价格等级价。未配置的价格不会在小程序展示。</div>
        <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>物料</th><th>产品</th><th>生效价</th><th>来源</th></tr></thead><tbody>
        ${prices.map((item) => `<tr><td>${escapeHtml(item.sku)}</td><td>${escapeHtml(item.name)}</td><td class="money">${formatMoney(item.price)}</td><td>${item.source === "CUSTOMER_SPECIFIC" ? "客户专属价" : "等级价"}</td></tr>`).join("")}
        </tbody></table></div>
      `, null, { hideSubmit: true });
    } catch (error) { toast(error.message, true); }
  }));
  $$("[data-auth-customer]").forEach((button) => button.addEventListener("click", () => {
    openCustomerAuthorization(button.dataset.authCustomer);
  }));
}

async function openCustomerAuthorization(customerId) {
  try {
    const data = await api(`/api/admin/customers/${customerId}/authorizations`);
    openModal("车型与区域授权", `
      <div class="callout">客户只能看到已授权车型对应的产品。当前授权区域为：${escapeHtml(`${data.province || ""}${data.city || ""}` || "未填写")}。</div>
      <div class="form-grid" style="margin-top:16px">
        ${data.allVehicles.map((vehicle) => `<label class="check-row"><input type="checkbox" name="vehicle" value="${escapeHtml(vehicle)}" ${data.authorizedVehicles.includes(vehicle) ? "checked" : ""}> ${escapeHtml(vehicle)}</label>`).join("")}
      </div>
    `, async (form) => {
      const vehicles = form.getAll("vehicle");
      if (!vehicles.length) throw new Error("至少授权一个车型");
      await api(`/api/admin/customers/${customerId}/authorizations`, {
        method: "PUT", body: { vehicles }
      });
      toast("车型授权已更新");
      await renderCustomers();
    }, "保存授权");
  } catch (error) {
    toast(error.message, true);
  }
}

function openCustomerModal(customer = null) {
  openModal(customer ? "编辑客户" : "新建客户", `
    <div class="form-grid">
      ${field("客户编码", "code", customer?.code, "text", true)}
      ${field("客户名称", "name", customer?.name, "text", true)}
      ${field("省份", "province", customer?.province)}
      ${field("城市", "city", customer?.city)}
      ${selectField("渠道类型", "channelType", [
        ["WHOLESALER", "全国省会批发商"], ["4S_GROUP", "4S店集团供应商"], ["CHAIN", "小规模连锁"]
      ], customer?.channelType || "WHOLESALER")}
      ${selectField("客户等级", "grade", [["A+", "A+"], ["A", "A"], ["B+", "B+"], ["B", "B"], ["C", "C"]], customer?.grade || "A")}
      ${field("价格等级", "priceTier", customer?.priceTier || "VIP", "text", true)}
      ${selectField("默认结算方式", "settlementMethod", [["CREDIT", "账期"], ["PREPAY", "预付款"]], customer?.settlementMethod || "CREDIT")}
      ${field("账期天数", "paymentTermsDays", customer?.paymentTermsDays ?? 30, "number")}
      ${field("授信额度（元）", "creditLimit", customer?.creditLimit ?? 20000, "number")}
      ${field("预付款比例", "prepayRatio", customer?.prepayRatio ?? 1, "number", true, "0.5 表示预付50%后可进入发货流程")}
      ${field("最多发货批次", "batchLimit", customer?.batchLimit ?? 3, "number")}
      ${field("绑定手机号", "phone", customer?.phone, "text", true)}
      ${field("收货地址", "address", customer?.address, "text", false, "", "wide")}
      <label class="field wide"><span>备注</span><textarea name="notes">${escapeHtml(customer?.notes || "")}</textarea></label>
      <label class="check-row wide"><input type="checkbox" name="active" ${customer?.active !== false ? "checked" : ""}> 账号启用</label>
      <label class="check-row wide"><input type="checkbox" name="allowOverpayment" ${customer?.allowOverpayment ? "checked" : ""}> 允许预付未足额时超发（默认关闭）</label>
    </div>
  `, async (form) => {
    const body = formToObject(form);
    body.paymentTermsDays = Number(body.paymentTermsDays);
    body.creditLimit = Number(body.creditLimit);
    body.prepayRatio = Number(body.prepayRatio);
    body.batchLimit = Number(body.batchLimit);
    body.active = form.get("active") === "on";
    body.allowOverpayment = form.get("allowOverpayment") === "on";
    await api(customer ? `/api/admin/customers/${customer.id}` : "/api/admin/customers", {
      method: customer ? "PUT" : "POST",
      body
    });
    toast(customer ? "客户资料已更新" : "客户已创建");
    await renderCustomers();
  }, customer ? "保存修改" : "创建客户");
}

async function renderProducts() {
  state.products = await api("/api/admin/products");
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="search-box"><input id="product-search" placeholder="搜索物料号、产品或车型"></div>
      <button class="button primary" id="add-product">+ 新建产品</button>
    </div>
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>产品</th><th>分类 / 车型</th><th>最小包装</th><th>基础价</th><th>可用库存</th><th>质保</th><th>操作</th></tr></thead>
        <tbody id="product-table-body">${productsTableRows(state.products)}</tbody>
      </table></div>
    </section>
  `;
  $("#add-product").addEventListener("click", () => openProductModal());
  $("#product-search").addEventListener("input", (event) => {
    const keyword = event.target.value.toLowerCase();
    const items = state.products.filter((item) => [item.sku, item.name, item.vehicleModel, item.category].some((value) => String(value).toLowerCase().includes(keyword)));
    $("#product-table-body").innerHTML = productsTableRows(items);
    bindProductRows();
  });
  bindProductRows();
}

function productsTableRows(products) {
  if (!products.length) return `<tr><td colspan="7">${emptyHtml("暂无产品")}</td></tr>`;
  return products.map((product) => `
    <tr>
      <td><div class="cell-title">${escapeHtml(product.name)}</div><div class="cell-sub">${escapeHtml(product.sku)}</div></td>
      <td>${escapeHtml(product.category)}<div class="cell-sub">${escapeHtml(product.vehicleModel)}</div></td>
      <td>${product.minPackage}</td>
      <td class="money">${formatMoney(product.basePrice)}</td>
      <td><strong>${product.realAvailable}</strong><div class="cell-sub">虚拟 ${product.virtualAvailable}</div></td>
      <td>${product.warrantyMonths}个月 / ${formatNumber(product.warrantyKm / 10000)}万公里</td>
      <td><button class="text-action" data-edit-product="${product.id}">编辑</button></td>
    </tr>
  `).join("");
}

function bindProductRows() {
  $$("[data-edit-product]").forEach((button) => button.addEventListener("click", () => {
    openProductModal(state.products.find((item) => item.id === button.dataset.editProduct));
  }));
}

function openProductModal(product = null) {
  openModal(product ? "编辑产品" : "新建产品", `
    <div class="form-grid">
      ${field("物料号", "sku", product?.sku, "text", true)}
      ${field("产品名称", "name", product?.name, "text", true)}
      ${field("分类", "category", product?.category || "球头", "text", true)}
      ${field("适配车型", "vehicleModel", product?.vehicleModel, "text", true)}
      ${field("最小包装", "minPackage", product?.minPackage ?? 1, "number", true)}
      ${field("基础价", "basePrice", product?.basePrice ?? 100, "number", true)}
      ${field("质保月数", "warrantyMonths", product?.warrantyMonths ?? 12, "number")}
      ${field("质保公里", "warrantyKm", product?.warrantyKm ?? 60000, "number")}
      <label class="field wide"><span>产品说明</span><textarea name="description">${escapeHtml(product?.description || "")}</textarea></label>
      <label class="check-row wide"><input type="checkbox" name="active" ${product?.active !== false ? "checked" : ""}> 产品启用</label>
    </div>
  `, async (form) => {
    const body = formToObject(form);
    for (const key of ["minPackage", "basePrice", "warrantyMonths", "warrantyKm"]) body[key] = Number(body[key]);
    body.active = form.get("active") === "on";
    await api(product ? `/api/admin/products/${product.id}` : "/api/admin/products", {
      method: product ? "PUT" : "POST", body
    });
    toast(product ? "产品已更新" : "产品已创建");
    await renderProducts();
  }, product ? "保存修改" : "创建产品");
}

async function renderPrices() {
  const [matrix, customers] = await Promise.all([api("/api/admin/prices"), api("/api/admin/customers")]);
  state.customers = customers;
  const tiers = matrix.tiers;
  const priceMap = new Map(matrix.tierPrices.map((price) => [`${price.tier}:${price.productId}`, price.price]));
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="callout" style="max-width:680px">价格只对已登录且被授权的客户展示。客户专属价优先于等级价；两类价格都不存在时，产品在小程序隐藏并禁止下单。</div>
      <button class="button primary" id="set-price">+ 设置价格</button>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>价格等级矩阵</h2><p>共 ${matrix.products.length} 个产品，${tiers.length} 个价格等级</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>产品</th><th>车型</th><th>基础价</th>${tiers.map((tier) => `<th>${escapeHtml(tier)}</th>`).join("")}</tr></thead><tbody>
      ${matrix.products.map((product) => `
        <tr><td><strong>${escapeHtml(product.name)}</strong><div class="cell-sub">${escapeHtml(product.sku)}</div></td><td>${escapeHtml(product.vehicleModel)}</td><td>${formatMoney(product.basePrice)}</td>
        ${tiers.map((tier) => `<td class="money">${priceMap.has(`${tier}:${product.id}`) ? formatMoney(priceMap.get(`${tier}:${product.id}`)) : "未配置"}</td>`).join("")}</tr>
      `).join("")}
      </tbody></table></div>
    </section>
    <section class="panel" style="margin-top:18px">
      <div class="panel-head"><div><h2>客户专属价</h2><p>专属价会覆盖同产品的等级价</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>客户</th><th>产品</th><th>专属价</th><th>操作</th></tr></thead><tbody>
      ${matrix.customerPrices.length ? matrix.customerPrices.map((price) => `
        <tr><td>${escapeHtml(price.customerName)}</td><td>${escapeHtml(price.productName)}<div class="cell-sub">${escapeHtml(price.sku)}</div></td><td class="money">${formatMoney(price.price)}</td><td><button class="text-action" data-reprice="${price.customerId}:${price.productId}">修改</button></td></tr>
      `).join("") : `<tr><td colspan="4">${emptyHtml("暂无客户专属价")}</td></tr>`}
      </tbody></table></div>
    </section>
  `;
  $("#set-price").addEventListener("click", () => openPriceModal(matrix));
  $$("[data-reprice]").forEach((button) => button.addEventListener("click", () => {
    const [customerId, productId] = button.dataset.reprice.split(":");
    openPriceModal(matrix, { customerId, productId });
  }));
}

function openPriceModal(matrix, preset = {}) {
  openModal("设置客户价格", `
    <div class="form-grid">
      ${selectField("价格范围", "scope", [["CUSTOMER", "指定客户专属价"], ["TIER", "价格等级统一价"]], preset.customerId ? "CUSTOMER" : "TIER")}
      <div id="tier-price-target">
        ${selectField("价格等级", "tier", matrix.tiers.map((tier) => [tier, tier]), "VIP")}
      </div>
      <div id="customer-price-target" hidden>
        ${selectField("客户", "customerId", state.customers.map((customer) => [customer.id, `${customer.name}（${customer.code}）`]), preset.customerId || state.customers[0]?.id)}
      </div>
      ${selectField("产品", "productId", matrix.products.map((product) => [product.id, `${product.name}（${product.sku}）`]), preset.productId || matrix.products[0]?.id)}
      ${field("生效价格", "price", "", "number", true)}
    </div>
    <div class="callout" style="margin-top:15px">保存后立即影响客户下一次报价，已提交订单的价格快照不会变化。</div>
  `, async (form) => {
    await api("/api/admin/prices", { method: "PUT", body: formToObject(form) });
    toast("价格已更新");
    await renderPrices();
  }, "保存价格");
  const scope = $('[name="scope"]', $("#modal"));
  const toggle = () => {
    $("#tier-price-target").hidden = scope.value !== "TIER";
    $("#customer-price-target").hidden = scope.value !== "CUSTOMER";
  };
  scope.addEventListener("change", toggle);
  toggle();
}

async function renderPlans() {
  const data = await api("/api/admin/plans");
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="filter-row"><select id="plan-status"><option value="">全部状态</option><option value="BANGBANG_REVIEW">邦邦审核</option><option value="SANLEI_REVIEW">三磊审核</option><option value="APPROVED">已审核</option><option value="REJECTED">已退回</option></select></div>
      <button class="button ghost" id="export-plans">导出计划</button>
    </div>
    <section class="panel"><div class="table-wrap"><table>
      <thead><tr><th>计划单</th><th>客户</th><th>月份</th><th>产品数</th><th>计划数量</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
      <tbody id="plan-table-body">${plansTableRows(data)}</tbody>
    </table></div></section>
  `;
  $("#plan-status").addEventListener("change", (event) => {
    const filtered = event.target.value ? data.filter((plan) => plan.status === event.target.value) : data;
    $("#plan-table-body").innerHTML = plansTableRows(filtered);
    bindPlanRows(data);
  });
  $("#export-plans").addEventListener("click", () => downloadFile("/api/admin/exports/plans/xlsx", "采购计划.xlsx"));
  bindPlanRows(data);
}

function plansTableRows(plans) {
  if (!plans.length) return `<tr><td colspan="8">${emptyHtml("暂无采购计划")}</td></tr>`;
  return plans.map((plan) => `
    <tr><td><strong>${escapeHtml(plan.planNo)}</strong><div class="cell-sub">${escapeHtml(plan.customerName)}</div></td>
    <td>${escapeHtml(plan.grade)} 级</td><td>${escapeHtml(plan.planMonth)}</td><td>${plan.itemCount}</td><td>${plan.totalQuantity}</td>
    <td>${statusBadge(plan.status)}</td><td>${formatDate(plan.submittedAt)}</td>
    <td><button class="text-action" data-plan-detail="${plan.id}">详情</button>${planActionsHtml(plan)}</td></tr>
  `).join("");
}

function planActionsHtml(plan) {
  const role = state.user.role;
  const buttons = [];
  if (plan.status === "BANGBANG_REVIEW" && ["SUPER_ADMIN", "BANGBANG_OPS"].includes(role)) {
    buttons.push(`<button class="text-action" data-plan-action="BANGBANG_APPROVE" data-plan-id="${plan.id}">通过</button>`);
    buttons.push(`<button class="text-action" data-plan-action="BANGBANG_REJECT" data-plan-id="${plan.id}">退回</button>`);
  }
  if (plan.status === "SANLEI_REVIEW" && ["SUPER_ADMIN", "SANLEI_SALES"].includes(role)) {
    buttons.push(`<button class="text-action" data-plan-action="SANLEI_APPROVE" data-plan-id="${plan.id}">生效</button>`);
    buttons.push(`<button class="text-action" data-plan-action="SANLEI_REJECT" data-plan-id="${plan.id}">退回</button>`);
  }
  return buttons.join("");
}

function bindPlanRows(plans) {
  $$("[data-plan-detail]").forEach((button) => button.addEventListener("click", () => {
    const plan = plans.find((item) => item.id === button.dataset.planDetail);
    openPlanDetail(plan);
  }));
  $$("[data-plan-action]").forEach((button) => button.addEventListener("click", () => {
    openPlanAction(button.dataset.planId, button.dataset.planAction);
  }));
}

function openPlanDetail(plan) {
  openModal(`采购计划 ${plan.planNo}`, `
    <dl class="detail-list">
      <dt>客户</dt><dd>${escapeHtml(plan.customerName)}（${escapeHtml(plan.grade)}级）</dd>
      <dt>计划月份</dt><dd>${escapeHtml(plan.planMonth)}</dd>
      <dt>审核状态</dt><dd>${statusBadge(plan.status)}</dd>
      <dt>客户备注</dt><dd>${escapeHtml(plan.customerNote || "—")}</dd>
      <dt>邦邦意见</dt><dd>${escapeHtml(plan.bangbangNote || "—")}</dd>
      <dt>三磊意见</dt><dd>${escapeHtml(plan.sanleiNote || "—")}</dd>
    </dl>
    <div class="table-wrap" style="margin-top:18px"><table><thead><tr><th>周次</th><th>物料</th><th>产品</th><th>计划数</th><th>已下单</th><th>剩余</th></tr></thead><tbody>
      ${plan.items.map((item) => `<tr><td>第${item.weekNo}周</td><td>${escapeHtml(item.sku)}</td><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${item.orderedQuantity}</td><td>${item.quantity - item.orderedQuantity}</td></tr>`).join("")}
    </tbody></table></div>
  `, null, { hideSubmit: true });
}

function openPlanAction(planId, action) {
  const isReject = action.endsWith("REJECT");
  openModal(isReject ? "退回采购计划" : "审核采购计划", `
    <label class="field"><span>${isReject ? "退回原因（必填）" : "审核意见"}</span><textarea name="note" ${isReject ? "required" : ""}></textarea></label>
  `, async (form) => {
    await api(`/api/admin/plans/${planId}/actions`, {
      method: "POST", body: { action, note: form.get("note") }
    });
    toast("计划状态已更新");
    await renderPlans();
  }, isReject ? "确认退回" : "确认通过");
}

async function renderOrders() {
  const query = new URLSearchParams(location.search);
  const data = await api("/api/admin/orders");
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="filter-row">
        <div class="search-box"><input id="order-search" placeholder="搜索订单号、客户或车型"></div>
        <select id="order-status"><option value="">全部状态</option><option value="PENDING_BANGBANG">待邦邦确认</option><option value="PENDING_PAYMENT">待付款</option><option value="PENDING_SANLEI">待接单</option><option value="PREPARING">备货中</option><option value="PARTIALLY_SHIPPED">部分发货</option><option value="SHIPPED">已发货</option><option value="COMPLETED">已完成</option><option value="CANCELLED">已取消</option></select>
      </div>
      <div class="toolbar-actions"><button class="button ghost" id="export-orders">导出订单</button></div>
    </div>
    <section class="panel">
      <div id="orders-table">${ordersTableHtml(data)}</div>
      <div class="pagination-note">最多展示最近 500 张子订单</div>
    </section>
  `;
  $("#export-orders").addEventListener("click", () => downloadFile("/api/admin/exports/orders/xlsx", "订单导出.xlsx"));
  const filter = () => {
    const keyword = $("#order-search").value.toLowerCase();
    const status = $("#order-status").value;
    const filtered = data.filter((order) => (!status || order.status === status) && (!keyword || [order.orderNo, order.groupNo, order.customerName, order.vehicleModel].some((value) => String(value).toLowerCase().includes(keyword))));
    $("#orders-table").innerHTML = ordersTableHtml(filtered);
    bindOrderLinks();
  };
  $("#order-search").addEventListener("input", filter);
  $("#order-status").addEventListener("change", filter);
  bindOrderLinks();
}

function ordersTableHtml(orders) {
  if (!orders.length) return emptyHtml("暂无订单");
  return `<div class="table-wrap"><table>
    <thead><tr><th>订单 / 总单</th><th>客户</th><th>车型</th><th>订单类型</th><th>金额 / 收发货</th><th>状态</th><th>下单时间</th><th>操作</th></tr></thead>
    <tbody>${orders.map((order) => `
      <tr>
        <td><strong>${escapeHtml(order.orderNo)}</strong><div class="cell-sub">${escapeHtml(order.groupNo)}</div></td>
        <td>${escapeHtml(order.customerName)}<div class="cell-sub">${escapeHtml(order.customerGrade)}级</div></td>
        <td>${escapeHtml(order.vehicleModel)}</td>
        <td>${statusNames[order.orderType] || order.orderType}<div class="cell-sub">${statusNames[order.settlementMethod] || order.settlementMethod}</div></td>
        <td class="money">${formatMoney(order.totalAmount)}<div class="cell-sub">已付 ${formatMoney(order.paidAmount)} · 已发 ${formatMoney(order.shippedAmount)}</div></td>
        <td>${statusBadge(order.status)}</td><td>${formatDate(order.createdAt)}</td>
        <td><button class="text-action" data-order-detail="${order.id}">处理</button></td>
      </tr>
    `).join("")}</tbody></table></div>`;
}

function bindOrderLinks() {
  $$("[data-order-detail]").forEach((button) => button.addEventListener("click", () => openOrderDetail(button.dataset.orderDetail)));
}

async function openOrderDetail(orderId) {
  try {
    const order = await api(`/api/admin/orders/${orderId}`);
    state.pendingDetail = order;
    const canConfirm = order.status === "PENDING_BANGBANG" && ["SUPER_ADMIN", "BANGBANG_OPS"].includes(state.user.role);
    const canAccept = order.status === "PENDING_SANLEI" && ["SUPER_ADMIN", "SANLEI_SALES"].includes(state.user.role);
    const canShip = ["PREPARING", "PARTIALLY_SHIPPED"].includes(order.status) && ["SUPER_ADMIN", "SANLEI_WAREHOUSE"].includes(state.user.role);
    const canCancel = !["COMPLETED", "CANCELLED", "SHIPPED"].includes(order.status) && order.paidAmount === 0;
    openModal(`订单 ${order.orderNo}`, `
      <div class="split-panels">
        <div>
          <dl class="detail-list">
            <dt>客户</dt><dd>${escapeHtml(order.customerName)}</dd>
            <dt>车型</dt><dd>${escapeHtml(order.vehicleModel)}</dd>
            <dt>类型</dt><dd>${statusNames[order.orderType] || order.orderType} / ${statusNames[order.settlementMethod] || order.settlementMethod}</dd>
            <dt>状态</dt><dd>${statusBadge(order.status)}</dd>
            <dt>订单金额</dt><dd class="money">${formatMoney(order.totalAmount)}</dd>
            <dt>已收款</dt><dd class="money">${formatMoney(order.paidAmount)}</dd>
            <dt>已发货</dt><dd class="money">${formatMoney(order.shippedAmount)}</dd>
            <dt>预付款门槛</dt><dd>${Math.round(order.prepayRatio * 100)}% · 最多${order.batchLimit}批</dd>
            <dt>客户备注</dt><dd>${escapeHtml(order.customerNote || "—")}</dd>
            <dt>内部备注</dt><dd>${escapeHtml(order.opsNote || "—")}</dd>
          </dl>
        </div>
        <div class="callout">
          <strong>总单 ${escapeHtml(order.groupNo)}</strong><br>
          ${order.group.siblingOrders.map((sibling) => `${escapeHtml(sibling.vehicleModel)}：${formatMoney(sibling.totalAmount)} · ${statusNames[sibling.status] || sibling.status}`).join("<br>")}
        </div>
      </div>
      <div class="table-wrap" style="margin-top:18px"><table><thead><tr><th>产品</th><th>单价</th><th>数量</th><th>金额</th><th>预占</th><th>已发</th></tr></thead><tbody>
        ${order.items.map((item) => `<tr><td>${escapeHtml(item.name)}<div class="cell-sub">${escapeHtml(item.sku)}</div></td><td>${formatMoney(item.unitPrice)}</td><td>${item.quantity}</td><td class="money">${formatMoney(item.amount)}</td><td>${item.reservedQuantity}</td><td>${item.shippedQuantity}</td></tr>`).join("")}
      </tbody></table></div>
      ${order.payments.length ? `<h3 style="font-size:14px;margin-top:21px">支付记录</h3><div class="table-wrap"><table><thead><tr><th>支付单号</th><th>金额</th><th>状态</th><th>交易号</th></tr></thead><tbody>${order.payments.map((payment) => `<tr><td>${escapeHtml(payment.paymentNo)}</td><td>${formatMoney(payment.amount)}</td><td>${statusBadge(payment.status)}</td><td>${escapeHtml(payment.transactionId || "—")}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${order.shipments.length ? `<h3 style="font-size:14px;margin-top:21px">发货批次</h3><div class="table-wrap"><table><thead><tr><th>批次</th><th>内容</th><th>物流</th><th>金额</th><th>状态</th></tr></thead><tbody>${order.shipments.map((shipment) => `<tr><td>第${shipment.batchNo}批</td><td>${escapeHtml(shipment.summary || "")}</td><td>${escapeHtml(shipment.logisticsCompany || "待补充")}<div class="cell-sub">${escapeHtml(shipment.trackingNo || "")}</div></td><td>${formatMoney(shipment.amount)}</td><td>${statusBadge(shipment.status)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="modal-actions" style="padding:20px 0 0;border:0;display:flex;flex-wrap:wrap">
        ${canConfirm ? `<button type="button" class="button primary" id="confirm-order">邦邦确认订单</button>` : ""}
        ${canAccept ? `<button type="button" class="button primary" id="accept-order">三磊接单</button>` : ""}
        ${canShip ? `<button type="button" class="button primary" id="ship-order">创建发货批次</button>` : ""}
        ${order.settlementMethod === "PREPAY" && ["PENDING_PAYMENT", "PARTIALLY_PAID"].includes(order.status) && state.user.role === "SUPER_ADMIN" ? `<button type="button" class="button ghost" id="mock-pay-order">模拟客户支付</button>` : ""}
        ${canCancel ? `<button type="button" class="button danger" id="cancel-order">取消订单</button>` : ""}
      </div>
    `, null, { hideSubmit: true, width: 980 });
    $("#confirm-order")?.addEventListener("click", () => orderAction(order.id, "BANGBANG_CONFIRM"));
    $("#accept-order")?.addEventListener("click", () => orderAction(order.id, "SANLEI_ACCEPT"));
    $("#ship-order")?.addEventListener("click", () => openShipmentModal(order));
    $("#mock-pay-order")?.addEventListener("click", () => openMockPaymentModal(order));
    $("#cancel-order")?.addEventListener("click", () => confirmAction("取消订单", "取消后会释放已预占库存。已有付款的订单不能直接取消。", async () => {
      await api(`/api/admin/orders/${order.id}/actions`, { method: "POST", body: { action: "CANCEL", reason: "内部取消" } });
      toast("订单已取消");
      closeModal();
      await renderOrders();
    }));
  } catch (error) {
    toast(error.message, true);
  }
}

async function orderAction(orderId, action) {
  try {
    await api(`/api/admin/orders/${orderId}/actions`, { method: "POST", body: { action } });
    toast("订单状态已更新");
    closeModal();
    await renderOrders();
  } catch (error) {
    toast(error.message, true);
  }
}

function openShipmentModal(order) {
  const availableItems = order.items.filter((item) => item.remainingQuantity > 0);
  openModal(`订单发货 · ${order.orderNo}`, `
    <div class="callout">本单最多 ${order.batchLimit} 批，已发 ${order.shipments.length} 批。${order.settlementMethod === "PREPAY" ? `预付款可发货余额 ${formatMoney(order.paidAmount - order.shippedAmount)}。` : "账期订单按授信履约。"}</div>
    <div class="form-grid" style="margin-top:15px">
      ${field("物流公司", "logisticsCompany", "顺丰速运", "text")}
      ${field("运单号", "trackingNo", "", "text")}
      ${field("发货地点 / 供应商", "dispatchLocation", "上海总仓", "text")}
      ${selectField("收货方式", "deliveryMode", [["DELIVERY", "送货上门"], ["PICKUP", "客户自提"]], "DELIVERY")}
    </div>
    <h3 style="font-size:14px;margin:20px 0 10px">本批发货数量</h3>
    <div class="shipment-lines">
      ${availableItems.map((item) => `
        <label class="shipment-line">
          <div><strong>${escapeHtml(item.name)}</strong><small>剩余 ${item.remainingQuantity} ${item.unitPrice ? `· 单价 ${formatMoney(item.unitPrice)}` : ""}</small></div>
          <input type="number" name="qty_${item.id}" min="0" max="${item.remainingQuantity}" value="0">
        </label>
      `).join("")}
    </div>
  `, async (form) => {
    const items = availableItems.map((item) => ({
      orderItemId: item.id,
      quantity: Number(form.get(`qty_${item.id}`))
    })).filter((item) => item.quantity > 0);
    if (!items.length) throw new Error("请至少填写一个产品的发货数量");
    await api(`/api/admin/orders/${order.id}/actions`, {
      method: "POST",
      body: {
        action: "SHIP",
        shipment: {
          logisticsCompany: form.get("logisticsCompany"),
          trackingNo: form.get("trackingNo"),
          dispatchLocation: form.get("dispatchLocation"),
          deliveryMode: form.get("deliveryMode"),
          items
        }
      }
    });
    toast("发货批次已创建");
    await renderOrders();
  }, "确认发货", { width: 720 });
}

function openMockPaymentModal(order) {
  openModal("模拟客户支付", `
    <div class="callout">这是测试环境的支付模拟入口，不会产生真实扣款。正式上线后将替换为邦邦商户号的微信支付回调。</div>
    <div class="form-grid" style="margin-top:15px">
      ${field("本次支付金额", "amount", Math.max(0, order.totalAmount - order.paidAmount), "number", true)}
    </div>
  `, async (form) => {
    await api("/api/admin/payments/mock", {
      method: "POST",
      body: { orderId: order.id, amount: Number(form.get("amount")) }
    });
    toast("模拟支付已到账");
    await renderOrders();
  }, "模拟到账");
}

async function renderInventory() {
  const [data, movements] = await Promise.all([
    api("/api/admin/inventory"),
    api("/api/admin/inventory/movements")
  ]);
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="callout" style="max-width:700px">可用库存 = 实物数量 − 已预占。真实库存优先占用，不足时再占用供应商承诺的虚拟库存。</div>
      <button class="button ghost" id="export-inventory">导出库存</button>
    </div>
    <section class="panel"><div class="table-wrap"><table>
      <thead><tr><th>产品</th><th>仓库 / 来源</th><th>库存总量</th><th>已预占</th><th>可用</th><th>更新时间</th><th>操作</th></tr></thead>
      <tbody>${data.map((row) => `<tr>
        <td><strong>${escapeHtml(row.name)}</strong><div class="cell-sub">${escapeHtml(row.sku)} · ${escapeHtml(row.vehicleModel)}</div></td>
        <td>${escapeHtml(row.warehouseName)}<div class="cell-sub">${statusNames[row.sourceType]}${row.supplierName ? ` · ${escapeHtml(row.supplierName)}` : ""}</div></td>
        <td>${row.quantity}</td><td>${row.reserved}</td><td><strong style="color:${row.available <= 20 ? "var(--danger)" : "var(--success)"}">${row.available}</strong></td>
        <td>${formatDate(row.updatedAt)}</td><td><button class="text-action" data-adjust-stock="${row.id}">调整</button><button class="text-action" data-transfer-stock="${row.id}">移库</button></td>
      </tr>`).join("")}</tbody>
    </table></div></section>
    <section class="panel" style="margin-top:18px">
      <div class="panel-head"><div><h2>最近库存流水</h2><p>入库、出库、预占释放与仓间移库均留痕</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>产品</th><th>仓库</th><th>类型</th><th>数量</th><th>说明</th><th>时间</th></tr></thead><tbody>
        ${movements.length ? movements.slice(0, 30).map((item) => `<tr><td>${escapeHtml(item.name)}<div class="cell-sub">${escapeHtml(item.sku)}</div></td><td>${escapeHtml(item.warehouseName)}</td><td>${escapeHtml(item.type)}</td><td class="${item.quantity < 0 ? "stock-number" : ""}">${item.quantity > 0 ? "+" : ""}${item.quantity}</td><td>${escapeHtml(item.note || "—")}</td><td>${formatDate(item.createdAt)}</td></tr>`).join("") : `<tr><td colspan="6">${emptyHtml("暂无库存流水")}</td></tr>`}
      </tbody></table></div>
    </section>
  `;
  $("#export-inventory").addEventListener("click", () => downloadFile("/api/admin/exports/inventory/xlsx", "库存导出.xlsx"));
  $$("[data-adjust-stock]").forEach((button) => button.addEventListener("click", () => {
    const row = data.find((item) => item.id === button.dataset.adjustStock);
    openModal(`库存调整 · ${row.name}`, `
      <div class="callout">当前 ${row.warehouseName} 总库存 ${row.quantity}，已预占 ${row.reserved}。调整后总量不得低于预占量。</div>
      <div class="form-grid" style="margin-top:15px">
        ${field("调整数量（正数入库 / 负数出库）", "quantity", "", "number", true)}
        ${field("调整原因", "note", "库存盘点调整", "text", true)}
      </div>
    `, async (form) => {
      await api(`/api/admin/inventory/${row.id}/adjust`, {
        method: "POST", body: { quantity: Number(form.get("quantity")), note: form.get("note") }
      });
      toast("库存已调整");
      await renderInventory();
    }, "确认调整");
  }));
  $$("[data-transfer-stock]").forEach((button) => button.addEventListener("click", () => {
    const source = data.find((item) => item.id === button.dataset.transferStock);
    const destinations = data.filter((item) => item.productId === source.productId && item.id !== source.id);
    if (!destinations.length) {
      toast("该产品没有其他仓库可作为移库目标", true);
      return;
    }
    openModal(`库存移库 · ${source.name}`, `
      <div class="callout">从 ${escapeHtml(source.warehouseName)} 移出，可用数量 ${source.available}。移库不会改变产品总库存。</div>
      <div class="form-grid" style="margin-top:15px">
        ${selectField("目标仓库", "destinationId", destinations.map((item) => [item.id, `${item.warehouseName}（${statusNames[item.sourceType]}）`]), destinations[0].id)}
        ${field("移库数量", "quantity", "", "number", true)}
        ${field("移库说明", "note", "仓间调拨", "text")}
      </div>
    `, async (form) => {
      const body = formToObject(form);
      await api("/api/admin/inventory/transfer", {
        method: "POST", body: { ...body, sourceId: source.id, quantity: Number(body.quantity) }
      });
      toast("移库已完成");
      await renderInventory();
    }, "确认移库");
  }));
}

async function renderShortages() {
  const data = await api("/api/admin/shortages");
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="callout" style="max-width:760px">系统按“预付款与客户等级优先，同时兼顾渠道、授信、近三月采购和订单紧急度”生成公平分配建议。每次确认都会重算预占并留痕。</div>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>缺货产品</h2><p>待履约需求大于当前可用库存</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>产品</th><th>车型</th><th>可用库存</th><th>待履约需求</th><th>缺口</th><th>操作</th></tr></thead><tbody>
        ${data.length ? data.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><div class="cell-sub">${escapeHtml(item.sku)}</div></td><td>${escapeHtml(item.vehicleModel)}</td><td>${item.available}</td><td>${item.pendingDemand}</td><td><strong class="stock-number">${item.shortage}</strong></td><td><button class="text-action" data-shortage="${item.productId}">生成分配建议</button></td></tr>`).join("") : `<tr><td colspan="6">${emptyHtml("当前没有缺货产品")}</td></tr>`}
      </tbody></table></div>
    </section>
  `;
  $$("[data-shortage]").forEach((button) => button.addEventListener("click", () => openShortagePreview(button.dataset.shortage)));
}

async function openShortagePreview(productId) {
  try {
    const preview = await api(`/api/admin/shortages/${productId}/preview`);
    openModal(`缺货分配 · ${preview.product.name}`, `
      <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
        ${metricCard("实际库存", preview.physicalStock, "可重新分配给未履约订单", "navy")}
        ${metricCard("待履约需求", preview.totalDemand, "含已预占与待确认订单", "orange")}
        ${metricCard("未满足需求", preview.unallocatedDemand, "建议确认后进入补货", "red")}
      </div>
      <div class="callout">分配权重：客户等级30%、渠道15%、授信15%、近三月采购15%、订单紧急度15%、付款优先10%。预付款和等级优先体现在综合得分中，数量按最小包装取整。</div>
      <div class="table-wrap" style="margin-top:15px"><table><thead><tr><th>订单 / 客户</th><th>等级</th><th>剩余需求</th><th>当前预占</th><th>综合得分</th><th>本次分配</th></tr></thead><tbody>
        ${preview.candidates.map((item) => `<tr><td><strong>${escapeHtml(item.orderNo)}</strong><div class="cell-sub">${escapeHtml(item.customerName)}</div></td><td>${escapeHtml(item.grade)}</td><td>${item.remainingQuantity}</td><td>${item.currentReserved}</td><td>${item.score.toFixed(3)}</td><td><input type="number" name="targets" data-order-item="${item.orderItemId}" min="${preview.product.minPackage}" step="${preview.product.minPackage}" value="${item.suggestedQuantity}" style="width:100px;text-align:right"></td></tr>`).join("")}
      </tbody></table></div>
    `, async () => {
      const targets = $$("[data-order-item]").map((input) => ({
        orderItemId: input.dataset.orderItem,
        quantity: Number(input.value)
      }));
      await api(`/api/admin/shortages/${productId}/apply`, {
        method: "POST", body: { targets }
      });
      toast("缺货分配已确认并重新预占库存");
      await renderShortages();
    }, "确认分配", { width: 980 });
  } catch (error) {
    toast(error.message, true);
  }
}

async function renderSuppliers() {
  const data = await api("/api/admin/suppliers");
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="callout" style="max-width:700px">供应商分为工厂直供和集成供应商。虚拟库存必须明确对应供应商承诺，不能与真实在库数量混用。</div>
      <button class="button primary" id="add-supplier">+ 新建供应商</button>
    </div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>供应商</th><th>类型</th><th>联系人</th><th>电话</th><th>状态</th><th>操作</th></tr></thead><tbody>
      ${data.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${item.type === "FACTORY" ? "工厂直供" : "集成供应商"}</td><td>${escapeHtml(item.contact || "—")}</td><td>${escapeHtml(item.phone || "—")}</td><td>${statusBadge(item.active ? "APPROVED" : "CANCELLED", item.active ? "合作中" : "停用")}</td><td><button class="text-action" data-edit-supplier="${item.id}">编辑</button></td></tr>`).join("")}
    </tbody></table></div></section>
  `;
  const openForm = (supplier = null) => openModal(supplier ? "编辑供应商" : "新建供应商", `
    <div class="form-grid">
      ${field("供应商名称", "name", supplier?.name, "text", true)}
      ${selectField("供应商类型", "type", [["FACTORY", "工厂直供"], ["INTEGRATOR", "集成供应商"]], supplier?.type || "INTEGRATOR")}
      ${field("联系人", "contact", supplier?.contact, "text")}
      ${field("联系电话", "phone", supplier?.phone, "text")}
      <label class="check-row wide"><input type="checkbox" name="active" ${supplier?.active !== false ? "checked" : ""}> 合作启用</label>
    </div>
  `, async (form) => {
    const body = formToObject(form);
    body.active = form.get("active") === "on";
    await api(supplier ? `/api/admin/suppliers/${supplier.id}` : "/api/admin/suppliers", {
      method: supplier ? "PUT" : "POST", body
    });
    toast(supplier ? "供应商已更新" : "供应商已创建");
    await renderSuppliers();
  }, supplier ? "保存修改" : "创建供应商");
  $("#add-supplier").addEventListener("click", () => openForm());
  $$("[data-edit-supplier]").forEach((button) => button.addEventListener("click", () => {
    openForm(data.find((item) => item.id === button.dataset.editSupplier));
  }));
}

async function renderFinance() {
  const [data, orders, customers] = await Promise.all([
    api("/api/admin/finance"),
    api("/api/admin/orders"),
    api("/api/admin/customers")
  ]);
  const pendingFreight = data.freight.filter((item) => item.status !== "SETTLED").reduce((sum, item) => sum + item.amount, 0);
  const pendingAdjustment = data.adjustments.filter((item) => item.status !== "SETTLED").reduce((sum, item) => sum + item.amount, 0);
  $("#page-content").innerHTML = `
    <div class="metrics-grid">
      ${metricCard("待开票", data.invoices.filter((item) => item.status === "PENDING").length, "财务待处理发票", "orange")}
      ${metricCard("累计开票", formatMoney(data.invoices.filter((item) => item.status === "ISSUED").reduce((sum, item) => sum + item.amount, 0)), "已开具金额", "navy")}
      ${metricCard("待结运费", formatMoney(pendingFreight), "含客户承担与公司垫付", "")}
      ${metricCard("待结调整款", formatMoney(pendingAdjustment), "索赔、退货及其他调整", "red")}
    </div>
    <div class="section-toolbar"><div class="toolbar-actions"><button class="button primary" id="invoice-new">+ 登记开票</button><button class="button ghost" id="freight-new">+ 运费</button><button class="button ghost" id="adjustment-new">+ 调整款</button></div></div>
    <section class="panel"><div class="panel-head"><div><h2>发票记录</h2><p>含税金额与开票状态统一留痕</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>发票号</th><th>订单</th><th>客户 / 抬头</th><th>金额</th><th>税率</th><th>状态</th><th>操作</th></tr></thead><tbody>
      ${data.invoices.length ? data.invoices.map((item) => `<tr><td>${escapeHtml(item.recordNo)}</td><td>${escapeHtml(item.orderNo)}</td><td>${escapeHtml(item.customerName)}<div class="cell-sub">${escapeHtml(item.title)}</div></td><td class="money">${formatMoney(item.amount)}</td><td>${item.taxRate}%</td><td>${statusBadge(item.status, item.status === "ISSUED" ? "已开票" : item.status === "PENDING" ? "待开票" : "已作废")}</td><td>${item.status === "PENDING" ? `<button class="text-action" data-invoice-issued="${item.id}">标记已开票</button>` : "—"}</td></tr>`).join("") : `<tr><td colspan="7">${emptyHtml("暂无发票记录")}</td></tr>`}
      </tbody></table></div>
    </section>
    <div class="split-panels" style="margin-top:18px">
      <section class="panel"><div class="panel-head"><div><h2>运费结算</h2><p>默认运费不计入货值</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>订单</th><th>客户</th><th>金额</th><th>承担方</th><th>状态</th><th>操作</th></tr></thead><tbody>
        ${data.freight.length ? data.freight.map((item) => `<tr><td>${escapeHtml(item.orderNo)}</td><td>${escapeHtml(item.customerName)}</td><td>${formatMoney(item.amount)}</td><td>${item.payer === "COMPANY" ? "公司" : "客户"}</td><td>${statusBadge(item.status, item.status === "SETTLED" ? "已结算" : "待结算")}</td><td>${item.status !== "SETTLED" ? `<button class="text-action" data-settle-freight="${item.id}">结算</button>` : "—"}</td></tr>`).join("") : `<tr><td colspan="6">${emptyHtml("暂无运费")}</td></tr>`}
        </tbody></table></div>
      </section>
      <section class="panel"><div class="panel-head"><div><h2>调整款</h2><p>索赔、退货款及其他对账调整</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>单号</th><th>客户</th><th>金额</th><th>状态</th><th>操作</th></tr></thead><tbody>
        ${data.adjustments.length ? data.adjustments.map((item) => `<tr><td>${escapeHtml(item.recordNo)}<div class="cell-sub">${escapeHtml(item.orderNo || "无关联订单")}</div></td><td>${escapeHtml(item.customerName)}</td><td>${formatMoney(item.amount)}</td><td>${statusBadge(item.status, item.status === "SETTLED" ? "已结算" : "待结算")}</td><td>${item.status !== "SETTLED" ? `<button class="text-action" data-settle-adjustment="${item.id}">结算</button>` : "—"}</td></tr>`).join("") : `<tr><td colspan="5">${emptyHtml("暂无调整款")}</td></tr>`}
        </tbody></table></div>
      </section>
    </div>
  `;
  $("#invoice-new").addEventListener("click", () => openModal("登记开票", `
    <div class="form-grid">
      ${selectField("订单", "orderId", orders.map((item) => [item.id, `${item.orderNo} · ${item.customerName} · ${formatMoney(item.totalAmount)}`]), orders[0]?.id)}
      ${field("发票抬头", "title", "", "text", true)}
      ${field("税号", "taxNumber", "", "text")}
      ${field("开票金额", "amount", "", "number")}
      ${field("税率（%）", "taxRate", 13, "number")}
      ${field("备注", "note", "", "text")}
    </div>
  `, async (form) => {
    await api("/api/admin/finance/invoices", { method: "POST", body: formToObject(form) });
    toast("开票记录已创建");
    await renderFinance();
  }, "创建记录"));
  $("#freight-new").addEventListener("click", () => openModal("登记运费", `
    <div class="form-grid">
      ${selectField("订单", "orderId", orders.map((item) => [item.id, `${item.orderNo} · ${item.customerName}`]), orders[0]?.id)}
      ${field("运费金额", "amount", "", "number", true)}
      ${selectField("承担方", "payer", [["CUSTOMER", "客户承担"], ["COMPANY", "公司承担"]], "CUSTOMER")}
      ${field("费用说明", "description", "物流运费", "text")}
    </div>
  `, async (form) => {
    await api("/api/admin/finance/freight", { method: "POST", body: formToObject(form) });
    toast("运费记录已创建");
    await renderFinance();
  }, "保存运费"));
  $("#adjustment-new").addEventListener("click", () => openModal("登记调整款", `
    <div class="form-grid">
      ${selectField("客户", "customerId", customers.map((item) => [item.id, item.name]), customers[0]?.id)}
      ${selectField("关联订单（可选）", "orderId", [["", "不关联订单"], ...orders.map((item) => [item.id, `${item.orderNo} · ${item.customerName}`])], "")}
      ${selectField("调整类型", "type", [["CLAIM", "索赔款"], ["RETURN_REFUND", "退货款"], ["FREIGHT_ADJUSTMENT", "运费调整"], ["OTHER", "其他"]], "CLAIM")}
      ${field("金额（负数表示冲减）", "amount", "", "number", true)}
      ${field("说明", "description", "", "text")}
    </div>
  `, async (form) => {
    await api("/api/admin/finance/adjustments", { method: "POST", body: formToObject(form) });
    toast("调整款已登记");
    await renderFinance();
  }, "保存调整款"));
  $$("[data-invoice-issued]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/admin/finance/invoices/${button.dataset.invoiceIssued}/status`, {
      method: "POST", body: { status: "ISSUED" }
    });
    toast("发票已标记开具");
    await renderFinance();
  }));
  $$("[data-settle-freight]").forEach((button) => button.addEventListener("click", () => settleFinance("freight", button.dataset.settleFreight)));
  $$("[data-settle-adjustment]").forEach((button) => button.addEventListener("click", () => settleFinance("adjustment", button.dataset.settleAdjustment)));
}

async function settleFinance(kind, id) {
  try {
    await api(`/api/admin/finance/${kind}/${id}/settle`, { method: "POST", body: {} });
    toast("结算状态已更新");
    await renderFinance();
  } catch (error) {
    toast(error.message, true);
  }
}

async function renderPayments() {
  const data = await api("/api/admin/payments");
  const paid = data.filter((item) => item.status === "SUCCEEDED");
  $("#page-content").innerHTML = `
    <div class="metrics-grid">
      ${metricCard("累计到账", formatMoney(paid.reduce((sum, item) => sum + item.amount, 0)), "测试环境模拟支付", "navy")}
      ${metricCard("支付记录", data.length, "含待支付与成功交易", "")}
      ${metricCard("待支付", data.filter((item) => item.status === "PENDING").length, "客户尚未完成支付", "orange")}
      ${metricCard("收款主体", "邦邦", "微信支付商户号待配置", "red")}
    </div>
    <div class="section-toolbar"><div class="callout" style="max-width:700px">当前为测试支付模式。取得邦邦微信支付商户号后，将启用微信支付 v3 下单、回调验签和原路退款。</div><button class="button ghost" id="export-payments">导出收款</button></div>
    <section class="panel"><div class="table-wrap"><table>
      <thead><tr><th>支付单号</th><th>订单</th><th>客户</th><th>金额</th><th>渠道</th><th>状态</th><th>交易号</th><th>时间</th></tr></thead>
      <tbody>${data.length ? data.map((payment) => `<tr><td>${escapeHtml(payment.paymentNo)}</td><td>${escapeHtml(payment.orderNo)}</td><td>${escapeHtml(payment.customerName)}</td><td class="money">${formatMoney(payment.amount)}</td><td>${statusNames[payment.channel] || payment.channel}</td><td>${statusBadge(payment.status)}</td><td>${escapeHtml(payment.transactionId || "—")}</td><td>${formatDate(payment.paidAt || payment.createdAt)}</td></tr>`).join("") : `<tr><td colspan="8">${emptyHtml("暂无支付记录")}</td></tr>`}</tbody>
    </table></div></section>
  `;
  $("#export-payments").addEventListener("click", () => downloadFile("/api/admin/exports/payments/xlsx", "收款导出.xlsx"));
}

async function renderAfterSales() {
  const data = await api("/api/admin/after-sales");
  $("#page-content").innerHTML = `
    <section class="panel"><div class="table-wrap"><table>
      <thead><tr><th>售后单</th><th>客户 / 订单</th><th>类型</th><th>问题描述</th><th>索赔金额</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>${data.length ? data.map((item) => `<tr><td><strong>${escapeHtml(item.caseNo)}</strong></td><td>${escapeHtml(item.customerName)}<div class="cell-sub">${escapeHtml(item.orderNo || "无订单")}</div></td><td>${statusNames[item.type] || item.type}</td><td>${escapeHtml(item.description).slice(0, 80)}</td><td class="money">${formatMoney(item.claimAmount)}</td><td>${statusBadge(item.status)}</td><td>${formatDate(item.createdAt)}</td><td>${["OPEN", "REVIEWING"].includes(item.status) && ["SUPER_ADMIN", "SANLEI_AFTERSALES"].includes(state.user.role) ? `<button class="text-action" data-aftersales="${item.id}">处理</button>` : "—"}</td></tr>`).join("") : `<tr><td colspan="8">${emptyHtml("暂无售后申请")}</td></tr>`}</tbody>
    </table></div></section>
  `;
  $$("[data-aftersales]").forEach((button) => button.addEventListener("click", () => {
    const item = data.find((entry) => entry.id === button.dataset.aftersales);
    openModal(`处理售后 · ${item.caseNo}`, `
      <div class="callout">${escapeHtml(item.description)}</div>
      <div class="form-grid" style="margin-top:15px">
        ${selectField("处理状态", "status", [["REVIEWING", "处理中"], ["APPROVED", "同意"], ["REJECTED", "拒绝"], ["CLOSED", "关闭"]], "REVIEWING")}
        <label class="field wide"><span>处理结论</span><textarea name="resolution"></textarea></label>
      </div>
    `, async (form) => {
      await api(`/api/admin/after-sales/${item.id}`, { method: "PUT", body: formToObject(form) });
      toast("售后处理已更新");
      await renderAfterSales();
    }, "保存处理结果");
  }));
}

async function renderReports() {
  const data = await api("/api/admin/reports/plan-execution");
  $("#page-content").innerHTML = `
    <div class="callout" style="margin-bottom:16px">计划执行率 = 已从已审核计划创建的计划订单数量 ÷ 计划数量。临时订单不纳入计划执行统计。</div>
    <section class="panel"><div class="table-wrap"><table>
      <thead><tr><th>计划月份</th><th>客户</th><th>等级</th><th>计划数量</th><th>已下计划单</th><th>执行率</th></tr></thead>
      <tbody>${data.length ? data.map((item) => `<tr><td>${escapeHtml(item.planMonth)}</td><td>${escapeHtml(item.customerName)}</td><td>${escapeHtml(item.grade)}</td><td>${item.plannedQuantity}</td><td>${item.orderedQuantity}</td><td><strong>${item.executionRate}%</strong></td></tr>`).join("") : `<tr><td colspan="6">${emptyHtml("暂无已审核计划")}</td></tr>`}</tbody>
    </table></div></section>
  `;
}

async function renderUsers() {
  const [users, customers] = await Promise.all([api("/api/admin/users"), api("/api/admin/customers")]);
  state.customers = customers;
  $("#page-content").innerHTML = `
    <div class="section-toolbar">
      <div class="callout" style="max-width:680px">客户账号由后台预建，客户只能查看自己的价格、订单、付款和物流；内部账号按角色限制菜单和数据范围。</div>
      <div class="toolbar-actions"><button class="button ghost" id="add-customer-user">+ 客户账号</button>${state.user.role === "SUPER_ADMIN" ? `<button class="button primary" id="add-staff-user">+ 内部账号</button>` : ""}</div>
    </div>
    <section class="panel"><div class="table-wrap"><table>
      <thead><tr><th>姓名</th><th>登录名 / 手机</th><th>角色</th><th>所属客户</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${users.map((user) => `<tr><td><strong>${escapeHtml(user.displayName)}</strong></td><td>${escapeHtml(user.username)}<div class="cell-sub">${escapeHtml(user.phone || "—")}</div></td><td>${roleNames[user.role] || user.role}</td><td>${escapeHtml(user.customerName || "内部账号")}</td><td>${statusBadge(user.active ? "APPROVED" : "CANCELLED", user.active ? "启用" : "停用")}</td><td>${user.role !== "SUPER_ADMIN" && state.user.role === "SUPER_ADMIN" ? `<button class="text-action" data-toggle-user="${user.id}" data-active="${user.active}">${user.active ? "停用" : "启用"}</button>` : "—"}</td></tr>`).join("")}</tbody>
    </table></div></section>
  `;
  $("#add-customer-user").addEventListener("click", openCustomerUserModal);
  $("#add-staff-user")?.addEventListener("click", openStaffUserModal);
  $$("[data-toggle-user]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/admin/users/${button.dataset.toggleUser}/toggle`, {
      method: "POST", body: { active: button.dataset.active !== "true" }
    });
    toast("账号状态已更新");
    await renderUsers();
  }));
}

function openCustomerUserModal() {
  openModal("新建客户子账号", `
    <div class="form-grid">
      ${selectField("所属客户", "customerId", state.customers.map((item) => [item.id, item.name]), state.customers[0]?.id)}
      ${field("姓名", "displayName", "", "text", true)}
      ${field("登录名", "username", "", "text", true)}
      ${field("微信绑定手机号", "phone", "", "text", true)}
    </div>
    <div class="callout" style="margin-top:15px">测试环境可直接用手机号登录；正式环境将通过微信手机号授权完成绑定。</div>
  `, async (form) => {
    await api("/api/admin/users/customer", { method: "POST", body: formToObject(form) });
    toast("客户账号已创建");
    await renderUsers();
  }, "创建账号");
}

function openStaffUserModal() {
  openModal("新建内部账号", `
    <div class="form-grid">
      ${field("姓名", "displayName", "", "text", true)}
      ${field("登录名", "username", "", "text", true)}
      ${field("初始密码", "password", "", "password", true)}
      ${selectField("角色", "role", [["BANGBANG_OPS", "邦邦运营"], ["BANGBANG_FINANCE", "邦邦财务"], ["SANLEI_SALES", "三磊内勤"], ["SANLEI_WAREHOUSE", "三磊仓库"], ["SANLEI_FINANCE", "三磊财务"], ["SANLEI_AFTERSALES", "三磊售后"]], "SANLEI_SALES")}
      ${field("手机号", "phone", "", "text")}
    </div>
  `, async (form) => {
    await api("/api/admin/users/staff", { method: "POST", body: formToObject(form) });
    toast("内部账号已创建");
    await renderUsers();
  }, "创建账号");
}

function renderImports() {
  const kinds = [
    ["customers", "客户档案", "客户编码、渠道、等级、账期、授信额度和预付款规则"],
    ["products", "产品档案", "物料号、品名、分类、车型、最小包装和质保信息"],
    ["prices", "价格矩阵", "按价格等级或客户编码批量设置产品价格"],
    ["inventory", "期初库存", "真实库存与供应商虚拟库存"]
  ];
  $("#page-content").innerHTML = `
    <div class="callout" style="margin-bottom:16px">支持 .xlsx 与 CSV 批量导入，适合首期上线和历史数据迁移。导入会整批校验，任意一行失败则全部回滚。</div>
    <div class="import-grid">
      ${kinds.map(([kind, title, description]) => `
        <section class="import-card">
          <h3>${title}</h3><p>${description}</p>
          <div class="toolbar-actions">
            <button class="button ghost small" data-template="${kind}">下载 Excel 模板</button>
            <label class="button small primary">导入 Excel<input class="file-input" hidden type="file" accept=".xlsx,.csv" data-import="${kind}"></label>
          </div>
        </section>
      `).join("")}
    </div>
    <section class="panel" style="margin-top:18px">
      <div class="panel-head"><div><h2>业务数据导出</h2><p>导出为标准 Excel 工作簿</p></div></div>
      <div class="panel-body toolbar-actions">
        <button class="button ghost" data-export="orders">导出订单</button>
        <button class="button ghost" data-export="inventory">导出库存</button>
        <button class="button ghost" data-export="payments">导出收款</button>
        <button class="button ghost" data-export="plans">导出采购计划</button>
      </div>
    </section>
  `;
  $$("[data-template]").forEach((button) => button.addEventListener("click", () => downloadFile(`/api/admin/import-templates/${button.dataset.template}/xlsx`, `${button.dataset.template}-template.xlsx`)));
  $$("[data-export]").forEach((button) => button.addEventListener("click", () => downloadFile(`/api/admin/exports/${button.dataset.export}/xlsx`, `${button.dataset.export}.xlsx`)));
  $$("[data-import]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      let result;
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        result = await api(`/api/admin/imports/${input.dataset.import}/xlsx`, {
          method: "POST",
          body: { fileBase64: btoa(binary) }
        });
      } else {
        const text = await file.text();
        result = await api(`/api/admin/imports/${input.dataset.import}`, { method: "POST", text });
      }
      toast(`成功导入 ${result.imported} 行`);
    } catch (error) {
      toast(error.message, true);
    } finally {
      input.value = "";
    }
  }));
}

async function showNotifications() {
  try {
    const data = await api("/api/notifications");
    openModal("通知中心", data.length ? `
      <div class="task-list">
        ${data.map((item) => `<div class="task-item"><span class="task-icon">${item.read ? "✓" : "·"}</span><div class="task-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.content)} · ${formatDate(item.createdAt)}</span></div></div>`).join("")}
      </div>
    ` : `<div class="empty-state"><strong>暂无通知</strong>订单和计划状态变化会显示在这里</div>`, null, { hideSubmit: true });
    await Promise.all(data.filter((item) => !item.read).map((item) => api(`/api/notifications/${item.id}/read`, { method: "POST" })));
    $("#notice-dot").hidden = true;
  } catch (error) {
    toast(error.message, true);
  }
}

async function loadNotificationsHint() {
  try {
    const data = await api("/api/notifications");
    $("#notice-dot").hidden = !data.some((item) => !item.read);
  } catch {
    $("#notice-dot").hidden = true;
  }
}

function openModal(title, bodyHtml, handler, options = {}) {
  const modalOptions = typeof options === "string" ? { submitText: options } : options;
  if ($("#modal").open) $("#modal").close();
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = bodyHtml;
  $("#modal-error").hidden = true;
  $("#modal-form").style.width = `${modalOptions.width || 760}px`;
  $("#modal-form").style.maxWidth = "94vw";
  const submit = $("#modal-submit");
  submit.hidden = Boolean(modalOptions.hideSubmit);
  submit.textContent = modalOptions.submitText || "确认";
  $("#modal").showModal();
  state.modalHandler = handler;
}

function closeModal() {
  if ($("#modal").open) $("#modal").close();
}

function confirmAction(title, message, handler) {
  openModal(title, `<p style="line-height:1.8">${escapeHtml(message)}</p>`, handler, { submitText: "确认" });
}

function field(label, name, value = "", type = "text", required = false, hint = "", cls = "") {
  return `<label class="field ${cls}"><span>${escapeHtml(label)}</span><input type="${type}" name="${name}" value="${escapeHtml(value ?? "")}" ${required ? "required" : ""} ${type === "number" && name.includes("Ratio") ? 'step="0.01" min="0.01" max="1"' : type === "number" ? 'step="0.01"' : ""}>${hint ? `<small class="field-hint">${escapeHtml(hint)}</small>` : ""}</label>`;
}

function selectField(label, name, options, selected) {
  return `<label class="field"><span>${escapeHtml(label)}</span><select name="${name}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
}

function formToObject(form) {
  return Object.fromEntries(form.entries());
}

function metricCard(label, value, sub, tone = "") {
  return `<article class="metric-card ${tone}"><div class="metric-label"><span>${escapeHtml(label)}</span><span>↗</span></div><strong class="metric-value">${escapeHtml(String(value))}</strong><span class="metric-sub">${escapeHtml(sub)}</span></article>`;
}

function statusBadge(status, forcedText = "") {
  return `<span class="status ${statusClasses[status] || ""}">${escapeHtml(forcedText || statusNames[status] || status)}</span>`;
}

function formatMoney(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadingHtml() {
  return `<div class="loading-state"><div><div class="spinner"></div>正在加载业务数据…</div></div>`;
}

function emptyHtml(message) {
  return `<div class="empty-state"><strong>${escapeHtml(message)}</strong>数据产生后会显示在这里</div>`;
}

function errorStateHtml(message) {
  return `<div class="panel"><div class="empty-state"><strong>数据加载失败</strong>${escapeHtml(message)}<div style="margin-top:16px"><button class="button ghost" onclick="location.reload()">重新加载</button></div></div></div>`;
}

function toast(message, isError = false) {
  const element = document.createElement("div");
  element.className = `toast ${isError ? "error" : ""}`;
  element.textContent = message;
  $("#toast-region").append(element);
  setTimeout(() => element.remove(), 3600);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!options.noAuth && state.token) headers.Authorization = `Bearer ${state.token}`;
  let body = options.body;
  if (options.text !== undefined) {
    headers["Content-Type"] = "text/csv; charset=utf-8";
    body = options.text;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(path, { method: options.method || "GET", headers, body });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(data?.error?.message || `请求失败（${response.status}）`);
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    throw error;
  }
  return data?.data ?? data;
}

async function downloadFile(path, filename) {
  try {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data?.error?.message || "下载失败");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast(error.message, true);
  }
}
