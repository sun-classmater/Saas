import { defineStore } from "pinia";
import { api, clearToken, getToken, setToken } from "../api/client.js";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: getToken(),
    user: null,
    loading: false
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token)
  },
  actions: {
    async login(username, password) {
      this.loading = true;
      try {
        const data = await api("/api/auth/login", {
          method: "POST",
          noAuth: true,
          body: { username, password }
        });
        this.token = data.token;
        this.user = data.user;
        setToken(data.token);
        return data.user;
      } finally {
        this.loading = false;
      }
    },
    async loadMe() {
      const data = await api("/api/me");
      this.user = data.user;
      this.customer = data.customer || null;
      return data;
    },
    async logout() {
      try {
        await api("/api/auth/logout", { method: "POST", body: {} });
      } catch {
        // 本地会话即使接口失败也要清理
      }
      this.token = "";
      this.user = null;
      clearToken();
    }
  }
});
