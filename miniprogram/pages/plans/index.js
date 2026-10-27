const { request, ensureLogin, toast } = require("../../utils/request");
const { statusNames, statusClass, formatDate } = require("../../utils/format");

Page({
  data: {
    loading: true,
    plans: [],
    activePlan: null
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadPlans();
  },

  async loadPlans() {
    try {
      const plans = await request({ url: "/mobile/plans" });
      this.setData({
        plans: plans.map((plan) => ({
          ...plan,
          statusName: statusNames[plan.status] || plan.status,
          statusClass: statusClass(plan.status),
          submittedText: formatDate(plan.submittedAt),
          weeks: [...new Set(plan.items.map((item) => item.weekNo))].sort((a, b) => a - b).map((weekNo) => ({
            weekNo,
            total: plan.items.filter((item) => item.weekNo === weekNo).reduce((sum, item) => sum + item.quantity, 0)
          }))
        })),
        loading: false
      });
    } catch (error) {
      toast(error.message);
      this.setData({ loading: false });
    }
  },

  createPlan() {
    wx.navigateTo({ url: "/pages/plan-edit/index" });
  },

  editPlan(event) {
    wx.navigateTo({ url: `/pages/plan-edit/index?id=${event.currentTarget.dataset.id}` });
  },

  togglePlan(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({
      activePlan: this.data.activePlan === id ? null : id
    });
  },

  planAction(event) {
    const { id, action } = event.currentTarget.dataset;
    wx.showModal({
      title: action === "SUBMIT" ? "提交采购计划" : "撤回采购计划",
      content: action === "SUBMIT" ? "提交后进入邦邦审核，审核中不能直接修改。" : "撤回后计划回到草稿状态，可重新编辑提交。",
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await request({ url: `/mobile/plans/${id}/actions`, method: "POST", data: { action } });
          toast(action === "SUBMIT" ? "已提交审核" : "已撤回", "success");
          await this.loadPlans();
        } catch (error) {
          toast(error.message);
        }
      }
    });
  }
});
