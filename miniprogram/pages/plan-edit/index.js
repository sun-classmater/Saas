const { request, toast } = require("../../utils/request");
const { statusNames, statusClass } = require("../../utils/format");

Page({
  data: {
    id: "",
    products: [],
    productNames: [],
    productIndex: 0,
    weekOptions: ["第1周", "第2周", "第3周", "第4周", "第5周", "第6周"],
    weekIndex: 0,
    quantity: 1,
    planMonth: "",
    note: "",
    lines: [],
    loading: true,
    saving: false
  },

  async onLoad(options) {
    try {
      const [catalog, plans] = await Promise.all([
        request({ url: "/mobile/catalog" }),
        request({ url: "/mobile/plans" })
      ]);
      const existing = options.id ? plans.find((plan) => plan.id === options.id) : null;
      if (existing && !["DRAFT", "REJECTED"].includes(existing.status)) {
        toast("审核中的计划请先撤回再修改");
        wx.navigateBack();
        return;
      }
      const products = catalog.products;
      this.setData({
        id: options.id || "",
        products,
        productNames: products.map((product) => `${product.name} · ${product.vehicleModel}`),
        quantity: products[0]?.minPackage || 1,
        planMonth: existing?.planMonth || nextMonth(),
        note: existing?.customerNote || "",
        lines: existing ? existing.items.map((item) => ({
          key: `${item.weekNo}:${item.productId}`,
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          weekNo: item.weekNo,
          quantity: item.quantity
        })) : [],
        loading: false
      });
    } catch (error) {
      toast(error.message);
      this.setData({ loading: false });
    }
  },

  selectProduct(event) {
    const productIndex = Number(event.detail.value);
    this.setData({ productIndex, quantity: this.data.products[productIndex].minPackage });
  },

  selectWeek(event) {
    this.setData({ weekIndex: Number(event.detail.value) });
  },

  quantityInput(event) {
    this.setData({ quantity: Number(event.detail.value) || 0 });
  },

  addLine() {
    const product = this.data.products[this.data.productIndex];
    const weekNo = this.data.weekIndex + 1;
    const quantity = Number(this.data.quantity);
    if (!product || quantity <= 0 || quantity % product.minPackage !== 0) {
      toast(`数量必须为最小包装 ${product?.minPackage || 1} 的倍数`);
      return;
    }
    const lines = [...this.data.lines];
    const existing = lines.find((line) => line.productId === product.id && line.weekNo === weekNo);
    if (existing) {
      existing.quantity += quantity;
    } else {
      lines.push({
        key: `${weekNo}:${product.id}`,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        weekNo,
        quantity
      });
    }
    this.setData({ lines: lines.sort((a, b) => a.weekNo - b.weekNo) });
  },

  removeLine(event) {
    this.setData({ lines: this.data.lines.filter((line) => line.key !== event.currentTarget.dataset.key) });
  },

  monthChange(event) {
    this.setData({ planMonth: event.detail.value });
  },

  noteInput(event) {
    this.setData({ note: event.detail.value });
  },

  async save(submitAfter) {
    if (this.data.saving) return;
    if (!this.data.lines.length) {
      toast("请至少添加一个计划产品");
      return;
    }
    this.setData({ saving: true });
    const payload = {
      planMonth: this.data.planMonth,
      note: this.data.note,
      items: this.data.lines.map((line) => ({
        weekNo: line.weekNo,
        productId: line.productId,
        quantity: line.quantity
      }))
    };
    try {
      const plan = await request({
        url: this.data.id ? `/mobile/plans/${this.data.id}` : "/mobile/plans",
        method: this.data.id ? "PUT" : "POST",
        data: payload
      });
      if (submitAfter) {
        await request({ url: `/mobile/plans/${plan.id}/actions`, method: "POST", data: { action: "SUBMIT" } });
      }
      toast(submitAfter ? "计划已提交审核" : "计划草稿已保存", "success");
      wx.navigateBack();
    } catch (error) {
      toast(error.message);
      this.setData({ saving: false });
    }
  },

  saveDraft() {
    this.save(false);
  },

  submitPlan() {
    this.save(true);
  }
});

function nextMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
