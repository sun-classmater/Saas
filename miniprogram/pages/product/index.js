const { request, toast } = require("../../utils/request");
const cartUtil = require("../../utils/cart");
const { formatMoney } = require("../../utils/format");

Page({
  data: {
    product: null,
    quantity: 0,
    loading: true,
    error: "",
    cartCount: 0
  },

  onLoad(options) {
    this.productId = options.id;
  },

  onShow() {
    this.setData({ cartCount: cartUtil.cartCount() });
    if (!this.data.product) this.loadProduct();
  },

  async loadProduct() {
    try {
      const result = await request({ url: "/mobile/catalog" });
      const product = result.products.find((item) => item.id === this.productId);
      if (!product) throw new Error("该产品当前不可订购");
      this.setData({
        product: { ...product, priceText: formatMoney(product.price) },
        quantity: product.minPackage,
        loading: false
      });
    } catch (error) {
      this.setData({ error: error.message, loading: false });
    }
  },

  changeQuantity(event) {
    const delta = Number(event.currentTarget.dataset.delta);
    const min = this.data.product.minPackage;
    const next = Math.max(min, this.data.quantity + delta * min);
    this.setData({ quantity: next });
  },

  addToCart() {
    cartUtil.addProduct(this.data.product, this.data.quantity);
    this.setData({ cartCount: cartUtil.cartCount() });
    toast("已加入购物车", "success");
  },

  openCart() {
    wx.navigateTo({ url: "/pages/cart/index" });
  }
});
