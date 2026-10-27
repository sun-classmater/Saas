const { request, ensureLogin, toast } = require("../../utils/request");
const cartUtil = require("../../utils/cart");
const { formatMoney } = require("../../utils/format");

Page({
  data: {
    loading: true,
    products: [],
    filtered: [],
    categories: ["全部"],
    activeCategory: "全部",
    keyword: "",
    customer: null,
    cartCount: 0,
    error: ""
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadCatalog();
  },

  async loadCatalog() {
    this.setData({ loading: true, error: "", cartCount: cartUtil.cartCount() });
    try {
      const result = await request({ url: "/mobile/catalog" });
      const products = result.products.map((product) => ({ ...product, priceText: formatMoney(product.price) }));
      const categories = ["全部", ...new Set(products.map((product) => product.category))];
      this.setData({ products, categories, customer: result.customer });
      this.applyFilter();
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyFilter() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const filtered = this.data.products.filter((product) => {
      const categoryOk = this.data.activeCategory === "全部" || product.category === this.data.activeCategory;
      const keywordOk = !keyword || [product.name, product.sku, product.vehicleModel].some((value) => String(value).toLowerCase().includes(keyword));
      return categoryOk && keywordOk;
    });
    this.setData({ filtered });
  },

  onSearch(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilter());
  },

  selectCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.category }, () => this.applyFilter());
  },

  openProduct(event) {
    wx.navigateTo({ url: `/pages/product/index?id=${event.currentTarget.dataset.id}` });
  },

  addProduct(event) {
    const product = this.data.products.find((item) => item.id === event.currentTarget.dataset.id);
    if (!product) return;
    cartUtil.addProduct(product, product.minPackage);
    this.setData({ cartCount: cartUtil.cartCount() });
    toast(`已加入 ${product.minPackage} 件`);
  },

  openCart() {
    wx.navigateTo({ url: "/pages/cart/index" });
  }
});
