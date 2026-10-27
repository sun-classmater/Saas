const { request, ensureLogin, toast } = require("../../utils/request");
const { formatMoney } = require("../../utils/format");

Page({
  data: {
    profile: null,
    unread: 0,
    orderCount: 0,
    loading: true
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const [profile, notices, orders] = await Promise.all([
        request({ url: "/mobile/profile" }),
        request({ url: "/notifications" }),
        request({ url: "/mobile/orders" })
      ]);
      this.setData({
        profile: {
          ...profile,
          avatarText: (profile.name || "客").slice(0, 1),
          channelName: profile.channelType === "WHOLESALER" ? "批发商" : profile.channelType === "4S_GROUP" ? "4S集团" : "连锁渠道",
          settlementName: profile.settlementMethod === "PREPAY" ? "预付" : "账期",
          creditLimitText: formatMoney(profile.creditLimit),
          outstandingText: formatMoney(profile.creditOutstanding),
          prepayPercent: Math.round(profile.prepayRatio * 100)
        },
        unread: notices.filter((item) => !item.read).length,
        orderCount: orders.length,
        loading: false
      });
    } catch (error) {
      toast(error.message);
      this.setData({ loading: false });
    }
  },

  openNotifications() {
    wx.navigateTo({ url: "/pages/notifications/index" });
  },

  openAfterSales() {
    wx.navigateTo({ url: "/pages/after-sales/index" });
  },

  contactService() {
    wx.showModal({
      title: "联系专属服务",
      content: "服务电话：021-60000001\n服务时间：工作日 09:00–18:00",
      showCancel: false
    });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需要重新绑定手机号登录。",
      success: (result) => {
        if (!result.confirm) return;
        request({ url: "/auth/logout", method: "POST", data: {} }).catch(() => {}).finally(() => {
          getApp().clearSession();
          wx.reLaunch({ url: "/pages/login/index" });
        });
      }
    });
  }
});
