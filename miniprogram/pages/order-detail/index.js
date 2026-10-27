const { request, toast } = require("../../utils/request");
const { statusNames, statusClass, formatMoney, formatDate } = require("../../utils/format");

Page({
  data: {
    id: "",
    order: null,
    loading: true,
    paying: false
  },

  onLoad(options) {
    this.setData({ id: options.id });
  },

  onShow() {
    if (this.data.id) this.loadOrder();
  },

  async loadOrder() {
    try {
      const raw = await request({ url: `/mobile/orders/${this.data.id}` });
      const order = {
        ...raw,
        groupTotalText: formatMoney(raw.group.siblingOrders.reduce((sum, item) => sum + item.totalAmount, 0)),
        statusName: statusNames[raw.status] || raw.status,
        statusClass: statusClass(raw.status),
        totalText: formatMoney(raw.totalAmount),
        paidText: formatMoney(raw.paidAmount),
        shippedText: formatMoney(raw.shippedAmount),
        dateText: formatDate(raw.createdAt),
        typeName: statusNames[raw.orderType] || raw.orderType,
        settlementName: raw.settlementMethod === "CREDIT" ? "账期" : "预付款",
        items: raw.items.map((item) => ({
          ...item,
          unitPriceText: formatMoney(item.unitPrice),
          amountText: formatMoney(item.amount)
        })),
        shipments: raw.shipments.map((shipment) => ({
          ...shipment,
          amountText: formatMoney(shipment.amount),
          dateText: formatDate(shipment.shippedAt),
          statusName: statusNames[shipment.status] || shipment.status,
          statusClass: statusClass(shipment.status)
        })),
        siblings: raw.group.siblingOrders.map((item) => ({
          ...item,
          totalText: formatMoney(item.totalAmount),
          statusName: statusNames[item.status] || item.status
        })),
        payments: raw.payments.map((payment) => ({
          ...payment,
          amountText: formatMoney(payment.amount),
          statusName: statusNames[payment.status] || payment.status
        }))
      };
      this.setData({ order, loading: false });
    } catch (error) {
      toast(error.message);
      this.setData({ loading: false });
    }
  },

  canPay() {
    return this.data.order?.settlementMethod === "PREPAY" && ["PENDING_PAYMENT", "PARTIALLY_PAID"].includes(this.data.order.status);
  },

  async pay() {
    if (this.data.paying || !this.canPay()) return;
    const outstanding = Math.round((this.data.order.totalAmount - this.data.order.paidAmount) * 100) / 100;
    const amount = await promptPaymentAmount(outstanding);
    if (amount == null) return;
    this.setData({ paying: true });
    try {
      const payment = await request({
        url: "/mobile/payments",
        method: "POST",
        data: { orderId: this.data.order.id, amount }
      });
      if (payment.mockMode) {
        await request({ url: `/mobile/payments/${payment.id}/mock-complete`, method: "POST", data: {} });
        toast("测试支付已到账", "success");
      } else if (payment.payParams) {
        await wxRequestPayment(payment.payParams);
        toast("支付成功", "success");
        await new Promise((resolve) => setTimeout(resolve, 800));
      } else {
        throw new Error("微信支付参数尚未配置，请联系运营人员");
      }
      await this.loadOrder();
    } catch (error) {
      toast(error.message);
    } finally {
      this.setData({ paying: false });
    }
  },

  async cancelOrder() {
    const confirm = await showModal("取消订单", "取消后会释放库存，已付款订单不能直接取消。");
    if (!confirm) return;
    try {
      await request({ url: `/mobile/orders/${this.data.order.id}/cancel`, method: "POST", data: { reason: "客户取消" } });
      toast("订单已取消", "success");
      await this.loadOrder();
    } catch (error) {
      toast(error.message);
    }
  },

  receiveShipment(event) {
    const shipmentId = event.currentTarget.dataset.id;
    wx.showModal({
      title: "确认收货",
      content: "请确认已经收到本批全部产品。",
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await request({ url: `/mobile/shipments/${shipmentId}/receive`, method: "POST", data: {} });
          toast("已确认收货", "success");
          await this.loadOrder();
        } catch (error) {
          toast(error.message);
        }
      }
    });
  },

  openAfterSales() {
    wx.navigateTo({ url: `/pages/after-sales/index?orderId=${this.data.order.id}` });
  }
});

function showModal(title, content) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false)
    });
  });
}

function wxRequestPayment(payParams) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...payParams,
      success: resolve,
      fail: (error) => reject(new Error(error.errMsg?.includes("cancel") ? "支付已取消" : "支付失败，请重试"))
    });
  });
}

function promptPaymentAmount(outstanding) {
  return new Promise((resolve) => {
    wx.showModal({
      title: "支付预付款",
      content: `本次最多可付 ${formatMoney(outstanding)}`,
      editable: true,
      placeholderText: `请输入本次支付金额，默认 ${formatMoney(outstanding)}`,
      success: (result) => {
        if (!result.confirm) {
          resolve(null);
          return;
        }
        const amount = Math.round(Number(result.content || outstanding) * 100) / 100;
        if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) {
          toast(`支付金额需大于0且不超过${formatMoney(outstanding)}`);
          resolve(null);
          return;
        }
        resolve(amount);
      },
      fail: () => resolve(null)
    });
  });
}
