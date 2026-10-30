<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { useAuthStore } from "../stores/auth.js";
import { visibleNavigation } from "../navigation.js";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = ref(!auth.user);

const sections = computed(() => visibleNavigation(auth.user?.role));
const activePath = computed(() => (route.path === "/" ? "/" : `/${route.path.split("/")[1]}`));

// ---------- 站内通知 ----------
const notices = ref([]);
const noticeVisible = ref(false);
const unread = computed(() => notices.value.filter((item) => !item.read).length);

async function loadNotices() {
  try {
    notices.value = await api("/api/notifications");
  } catch {
    // 通知加载失败不影响主流程
  }
}

async function markRead(item) {
  if (item.read) return;
  try {
    await api(`/api/notifications/${item.id}/read`, { method: "POST", body: {} });
    item.read = true;
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function markAllRead() {
  const pending = notices.value.filter((item) => !item.read);
  if (!pending.length) return;
  try {
    await Promise.all(
      pending.map((item) => api(`/api/notifications/${item.id}/read`, { method: "POST", body: {} }))
    );
    notices.value = notices.value.map((item) => ({ ...item, read: true }));
  } catch (error) {
    ElMessage.error(error.message);
  }
}

// ---------- 修改密码 ----------
const passwordVisible = ref(false);
const passwordSaving = ref(false);
const passwordForm = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });

function openPassword() {
  Object.assign(passwordForm, { currentPassword: "", newPassword: "", confirmPassword: "" });
  passwordVisible.value = true;
}

async function submitPassword() {
  if (!passwordForm.currentPassword) {
    ElMessage.warning("请输入当前密码");
    return;
  }
  if (passwordForm.newPassword.length < 8) {
    ElMessage.warning("新密码至少 8 位");
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.warning("两次输入的新密码不一致");
    return;
  }
  passwordSaving.value = true;
  try {
    await api("/api/auth/change-password", {
      method: "POST",
      body: { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }
    });
    ElMessage.success("密码已更新，其他设备上的登录已失效");
    passwordVisible.value = false;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    passwordSaving.value = false;
  }
}

onMounted(async () => {
  try {
    if (!auth.user) await auth.loadMe();
  } catch (error) {
    if (error.status === 401) {
      await router.replace("/login");
      return;
    }
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
  loadNotices();
});

async function logout() {
  await auth.logout();
  router.replace("/login");
}
</script>

<template>
  <el-container class="app-shell">
    <el-aside width="232px" class="sidebar">
      <div class="brand">
        <span class="brand-mark">三</span>
        <div>
          <strong>三磊 · 车邻汇</strong>
          <small>ORDER OS · v0.2</small>
        </div>
      </div>
      <el-scrollbar>
        <el-menu :default-active="activePath" router class="nav-menu">
          <template v-for="section in sections" :key="section.group">
            <div class="nav-group">{{ section.group }}</div>
            <el-menu-item v-for="item in section.items" :key="item.id" :index="item.path">
              {{ item.label }}
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
      <div class="sidebar-foot">迁移中 · 前端 Vue 3</div>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div>
          <p class="eyebrow">OPERATIONS</p>
          <h1>{{ route.meta.title || "工作台" }}</h1>
        </div>
        <div class="topbar-user" v-if="auth.user">
          <el-popover v-model:visible="noticeVisible" placement="bottom-end" :width="340" trigger="click">
            <template #reference>
              <el-badge :value="unread" :hidden="!unread" class="notice-badge">
                <el-button text>消息</el-button>
              </el-badge>
            </template>
            <div class="notice-head">
              <strong>站内消息</strong>
              <el-button text size="small" :disabled="!unread" @click="markAllRead">全部已读</el-button>
            </div>
            <el-scrollbar max-height="320px">
              <el-empty v-if="!notices.length" description="暂无消息" :image-size="60" />
              <div
                v-for="item in notices"
                :key="item.id"
                class="notice-item"
                :class="{ unread: !item.read }"
                @click="markRead(item)"
              >
                <div class="notice-title">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.createdAt }}</small>
                </div>
                <p class="muted">{{ item.content }}</p>
              </div>
            </el-scrollbar>
          </el-popover>
          <span class="avatar">{{ auth.user.displayName?.slice(0, 1) || "管" }}</span>
          <div>
            <strong>{{ auth.user.displayName }}</strong>
            <small>{{ auth.user.role }}</small>
          </div>
          <el-button text @click="openPassword">改密</el-button>
          <el-button text @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="page-main" v-loading="loading">
        <router-view />
      </el-main>
    </el-container>

    <el-dialog v-model="passwordVisible" title="修改登录密码" width="420px">
      <el-form label-width="92px">
        <el-form-item label="当前密码">
          <el-input v-model="passwordForm.currentPassword" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.newPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="submitPassword">确认修改</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>
