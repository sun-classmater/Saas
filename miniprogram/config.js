const API_BASES = {
  develop: "http://127.0.0.1:8788/api",
  trial: "https://order.example.com/api",
  release: "https://order.example.com/api"
};

function getApiBase() {
  try {
    const envVersion = wx.getAccountInfoSync().miniProgram.envVersion || "develop";
    return API_BASES[envVersion] || API_BASES.develop;
  } catch {
    return API_BASES.develop;
  }
}

module.exports = { getApiBase, API_BASES };
