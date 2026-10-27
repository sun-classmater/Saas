<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useAuthStore } from "../stores/auth.js";
import { visibleNavigation } from "../navigation.js";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = ref(!auth.user);

const sections = computed(() => visibleNavigation(auth.user?.role));
const activePath = computed(() => (route.path === "/" ? "/" : `/${route.path.split("/")[1]}`));

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
          <span class="avatar">{{ auth.user.displayName?.slice(0, 1) || "管" }}</span>
          <div>
            <strong>{{ auth.user.displayName }}</strong>
            <small>{{ auth.user.role }}</small>
          </div>
          <el-button text @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="page-main" v-loading="loading">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
