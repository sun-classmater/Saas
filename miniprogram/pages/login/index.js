const { request, toast } = require("../../utils/request");

Page({
  data: {
    phone: "13800000001",
    loading: false,
    error: "",
    mode: "mock"
  },

  async onLoad() {
    if (getApp().globalData.token) {
      wx.switchTab({ url: "/pages/catalog/index" });
      return;
    }
    try {
      const health = await request({ url: "/health", auth: false });
      this.setData({ mode: health.wechatMode || "mock" });
    } catch {
      this.setData({ mode: "mock" });
    }
  },

  onPhoneInput(event) {
    this.setData({ phone: event.detail.value, error: "" });
  },

  async login() {
    if (this.data.loading) return;
    if (!/^1\d{10}$/.test(this.data.phone)) {
      this.setData({ error: "请输入后台已开通的11位手机号" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const result = await request({
        url: "/auth/dev-login",
        method: "POST",
        data: { phone: this.data.phone },
        auth: false
      });
      getApp().setSession(result.token, result.user);
      toast("登录成功", "success");
      wx.switchTab({ url: "/pages/catalog/index" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loginWithWechat(event) {
    if (this.data.loading) return;
    if (!event.detail.code) {
      this.setData({ error: "需要授权手机号后才能匹配已开通的客户账号" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const loginResult = await wxLogin();
      const result = await request({
        url: "/auth/wechat-login",
        method: "POST",
        auth: false,
        data: { code: loginResult.code, phoneCode: event.detail.code }
      });
      getApp().setSession(result.token, result.user);
      toast("登录成功", "success");
      wx.switchTab({ url: "/pages/catalog/index" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  }
});

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: () => reject(new Error("微信登录失败，请重试"))
    });
  });
}
