const { request, toast } = require("../../utils/request");
const { statusNames, statusClass, formatDate, formatMoney } = require("../../utils/format");

Page({
  data: {
    orders: [],
    orderNames: [],
    orderIndex: 0,
    types: [
      { value: "CLAIM", label: "质量索赔" },
      { value: "RETURN", label: "退货" },
      { value: "WRONG_ITEM", label: "发错货" },
      { value: "REPLACEMENT", label: "更换" },
      { value: "MARKET_FEEDBACK", label: "市场质量反馈" }
    ],
    typeIndex: 0,
    description: "",
    claimAmount: "",
    cases: [],
    loading: true,
    submitting: false
  },

  async onLoad(options) {
    await this.loadData();
    if (options.orderId) {
      const index = this.data.orders.findIndex((order) => order.id === options.orderId);
      if (index >= 0) this.setData({ orderIndex: index });
    }
  },

  async loadData() {
    try {
      const [orders, cases] = await Promise.all([
        request({ url: "/mobile/orders" }),
        request({ url: "/mobile/after-sales" })
      ]);
      this.setData({
        orders,
        orderNames: orders.map((order) => `${order.orderNo} · ${order.vehicleModel}`),
        cases: cases.map((item) => ({
          ...item,
          typeName: statusNames[item.type] || item.type,
          statusName: statusNames[item.status] || item.status,
          statusClass: statusClass(item.status),
          dateText: formatDate(item.createdAt),
          amountText: formatMoney(item.claimAmount)
        })),
        loading: false
      });
    } catch (error) {
      toast(error.message);
      this.setData({ loading: false });
    }
  },

  selectOrder(event) {
    this.setData({ orderIndex: Number(event.detail.value) });
  },

  selectType(event) {
    this.setData({ typeIndex: Number(event.detail.value) });
  },

  descriptionInput(event) {
    this.setData({ description: event.detail.value });
  },

  amountInput(event) {
    this.setData({ claimAmount: event.detail.value });
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.data.orders.length) {
      toast("暂无可申请售后的订单");
      return;
    }
    if (this.data.description.trim().length < 5) {
      toast("请至少填写5个字的问题描述");
      return;
    }
    this.setData({ submitting: true });
    try {
      await request({
        url: "/mobile/after-sales",
        method: "POST",
        data: {
          orderId: this.data.orders[this.data.orderIndex].id,
          type: this.data.types[this.data.typeIndex].value,
          description: this.data.description,
          claimAmount: Number(this.data.claimAmount || 0)
        }
      });
      toast("售后申请已提交", "success");
      this.setData({ description: "", claimAmount: "", submitting: false });
      await this.loadData();
    } catch (error) {
      toast(error.message);
      this.setData({ submitting: false });
    }
  }
});
