function request({ url, method = "GET", data, auth = true }) {
  const app = getApp();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBase}${url}`,
      method,
      data,
      timeout: 20000,
      header: {
        "Content-Type": "application/json",
        ...(auth && app.globalData.token ? { Authorization: `Bearer ${app.globalData.token}` } : {})
      },
      success(response) {
        if (response.statusCode === 401) {
          app.clearSession();
          wx.reLaunch({ url: "/pages/login/index" });
          reject(new Error("登录已失效，请重新登录"));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(response.data?.error?.message || `请求失败（${response.statusCode}）`));
          return;
        }
        resolve(response.data?.data ?? response.data);
      },
      fail(error) {
        reject(new Error(error.errMsg?.includes("timeout") ? "网络超时，请稍后重试" : "无法连接订货系统"));
      }
    });
  });
}

function ensureLogin() {
  const app = getApp();
  if (!app.globalData.token) {
    wx.reLaunch({ url: "/pages/login/index" });
    return false;
  }
  return true;
}

function toast(message, icon = "none") {
  wx.showToast({ title: String(message || ""), icon, duration: 2400 });
}

module.exports = { request, ensureLogin, toast };
