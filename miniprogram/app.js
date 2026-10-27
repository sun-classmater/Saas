const { getApiBase } = require("./config");

App({
  globalData: {
    apiBase: getApiBase(),
    token: "",
    user: null,
    cart: []
  },

  onLaunch() {
    this.globalData.token = wx.getStorageSync("chelinhui_token") || "";
    this.globalData.user = wx.getStorageSync("chelinhui_user") || null;
    this.globalData.cart = wx.getStorageSync("chelinhui_cart") || [];
  },

  setSession(token, user) {
    this.globalData.token = token;
    this.globalData.user = user;
    wx.setStorageSync("chelinhui_token", token);
    wx.setStorageSync("chelinhui_user", user);
  },

  clearSession() {
    this.globalData.token = "";
    this.globalData.user = null;
    wx.removeStorageSync("chelinhui_token");
    wx.removeStorageSync("chelinhui_user");
  },

  setCart(cart) {
    this.globalData.cart = cart;
    wx.setStorageSync("chelinhui_cart", cart);
  }
});
