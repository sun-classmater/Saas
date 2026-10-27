const { request, ensureLogin, toast } = require("../../utils/request");
const { statusNames, statusClass, formatMoney, formatDate } = require("../../utils/format");

Page({
  data: {
    loading: true,
    orders: [],
    filtered: [],
    tabs: [
      { value: "", label: "全部" },
      { value: "PENDING_PAYMENT", label: "待付款" },
      { value: "PREPARING", label: "备货中" },
      { value: "PARTIALLY_SHIPPED", label: "待收货" },
      { value: "COMPLETED", label: "已完成" }
    ],
    activeTab: ""
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadOrders();
  },

  async loadOrders() {
    try {
      const orders = await request({ url: "/mobile/orders" });
      this.setData({ orders: orders.map(decorateOrder) });
      this.applyFilter();
    } catch (error) {
      toast(error.message);
    } finally {
      this.setData({ loading: false });
    }
  },

  selectTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.value }, () => this.applyFilter());
  },

  applyFilter() {
    const active = this.data.activeTab;
    let filtered = this.data.orders;
    if (active === "PARTIALLY_SHIPPED") {
      filtered = filtered.filter((order) => ["PARTIALLY_SHIPPED", "SHIPPED"].includes(order.status));
    } else if (active) {
      filtered = filtered.filter((order) => order.status === active || (active === "PENDING_PAYMENT" && order.status === "PARTIALLY_PAID"));
    }
    this.setData({ filtered });
  },

  openOrder(event) {
    wx.navigateTo({ url: `/pages/order-detail/index?id=${event.currentTarget.dataset.id}` });
  }
});

function decorateOrder(order) {
  return {
    ...order,
    statusName: statusNames[order.status] || order.status,
    statusClass: statusClass(order.status),
    totalText: formatMoney(order.totalAmount),
    dateText: formatDate(order.createdAt),
    typeName: statusNames[order.orderType] || order.orderType
  };
}
