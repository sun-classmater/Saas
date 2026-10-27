const cartUtil = require("../../utils/cart");
const { formatMoney } = require("../../utils/format");
const { toast } = require("../../utils/request");

Page({
  data: {
    items: [],
    total: "¥0.00",
    quantity: 0
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const items = cartUtil.getCart().map((item) => ({
      ...item,
      lineTotal: formatMoney(item.product.price * item.quantity)
    }));
    this.setData({
      items,
      total: formatMoney(cartUtil.cartTotal()),
      quantity: cartUtil.cartCount()
    });
  },

  changeQuantity(event) {
    const item = this.data.items.find((entry) => entry.product.id === event.currentTarget.dataset.id);
    const delta = Number(event.currentTarget.dataset.delta);
    const quantity = item.quantity + delta * item.product.minPackage;
    cartUtil.updateQuantity(item.product.id, quantity);
    this.refresh();
  },

  removeItem(event) {
    cartUtil.removeProduct(event.currentTarget.dataset.id);
    this.refresh();
  },

  clearCart() {
    wx.showModal({
      title: "清空购物车",
      content: "确认移除全部产品吗？",
      success: (result) => {
        if (result.confirm) {
          cartUtil.clearCart();
          this.refresh();
        }
      }
    });
  },

  confirmOrder() {
    if (!this.data.items.length) {
      toast("购物车还是空的");
      return;
    }
    wx.navigateTo({ url: "/pages/order-confirm/index" });
  }
});
