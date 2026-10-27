const { request, toast } = require("../../utils/request");
const cartUtil = require("../../utils/cart");
const { formatMoney } = require("../../utils/format");

Page({
  data: {
    items: [],
    total: "¥0.00",
    profile: null,
    orderTypes: [
      { value: "NORMAL", label: "正常订货" },
      { value: "PREPAY", label: "预付款订货" },
      { value: "TEMPORARY", label: "临时紧急订货" },
      { value: "PLAN", label: "从采购计划下单" },
      { value: "NEW_PRODUCT", label: "新产品开发单" }
    ],
    typeIndex: 0,
    settlementLabel: "账期",
    plans: [],
    planIndex: 0,
    planNames: [],
    weekOptions: ["第1周", "第2周", "第3周", "第4周", "第5周", "第6周"],
    weekIndex: 0,
    note: "",
    loading: true,
    submitting: false
  },

  async onLoad() {
    const items = cartUtil.getCart().map((item) => ({
      ...item,
      lineTotal: formatMoney(item.product.price * item.quantity)
    }));
    this.setData({ items, total: formatMoney(cartUtil.cartTotal()) });
    try {
      const [profile, plans] = await Promise.all([
        request({ url: "/mobile/profile" }),
        request({ url: "/mobile/plans?status=APPROVED" })
      ]);
      this.setData({
        profile,
        plans,
        planNames: plans.map((plan) => `${plan.planNo} · ${plan.planMonth}`),
        settlementLabel: profile.settlementMethod === "PREPAY" ? "预付款" : "账期",
        loading: false
      });
    } catch (error) {
      toast(error.message);
      this.setData({ loading: false });
    }
  },

  selectType(event) {
    const typeIndex = Number(event.detail.value);
    const value = this.data.orderTypes[typeIndex].value;
    this.setData({
      typeIndex,
      settlementLabel: ["PREPAY", "NEW_PRODUCT"].includes(value) ? "预付款" : (this.data.profile?.settlementMethod === "PREPAY" ? "预付款" : "账期")
    });
  },

  selectPlan(event) {
    this.setData({ planIndex: Number(event.detail.value) });
  },

  selectWeek(event) {
    this.setData({ weekIndex: Number(event.detail.value) });
  },

  onNoteInput(event) {
    this.setData({ note: event.detail.value });
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.data.items.length) {
      toast("购物车为空");
      return;
    }
    const orderType = this.data.orderTypes[this.data.typeIndex].value;
    if (orderType === "PLAN" && !this.data.plans.length) {
      toast("没有已审核通过的采购计划");
      return;
    }
    this.setData({ submitting: true });
    try {
      const payload = {
        orderType,
        note: this.data.note,
        items: this.data.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity
        }))
      };
      if (orderType === "PLAN") {
        payload.planId = this.data.plans[this.data.planIndex].id;
        payload.planWeek = this.data.weekIndex + 1;
      }
      const result = await request({ url: "/mobile/orders", method: "POST", data: payload });
      cartUtil.clearCart();
      wx.showModal({
        title: "订单提交成功",
        content: `总单 ${result.groupNo} 已提交，等待邦邦确认。`,
        showCancel: false,
        success: () => {
          wx.redirectTo({ url: `/pages/order-detail/index?id=${result.orderIds[0]}` });
        }
      });
    } catch (error) {
      toast(error.message);
      this.setData({ submitting: false });
    }
  }
});
