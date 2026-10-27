const { request, toast } = require("../../utils/request");
const { formatDate } = require("../../utils/format");

Page({
  data: { loading: true, notifications: [] },

  onShow() {
    this.loadNotifications();
  },

  async loadNotifications() {
    try {
      const items = await request({ url: "/notifications" });
      this.setData({
        notifications: items.map((item) => ({ ...item, dateText: formatDate(item.createdAt) })),
        loading: false
      });
    } catch (error) {
      toast(error.message);
      this.setData({ loading: false });
    }
  },

  async markRead(event) {
    const item = this.data.notifications.find((entry) => entry.id === event.currentTarget.dataset.id);
    if (!item || item.read) return;
    try {
      await request({ url: `/notifications/${item.id}/read`, method: "POST" });
      this.setData({
        notifications: this.data.notifications.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry)
      });
    } catch (error) {
      toast(error.message);
    }
  }
});
