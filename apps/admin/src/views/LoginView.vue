<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ username: "admin", password: "Admin@123" });
const submitting = ref(false);

async function submit() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    await auth.login(form.username, form.password);
    ElMessage.success("登录成功");
    router.replace("/");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-view">
    <div class="login-brand">
      <p class="eyebrow">CHANNEL COMMERCE</p>
      <h1>让每一张渠道订单<br /><em>清楚、可控、可追溯</em></h1>
      <p class="muted">Fastify + MySQL + Vue 3 工程化迁移版</p>
    </div>
    <el-card class="login-card" shadow="never">
      <h2>登录工作台</h2>
      <p class="muted">使用内部账号或演示身份进入系统</p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名">
          <el-input v-model="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password autocomplete="current-password" @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" class="login-button" :loading="submitting" @click="submit">
          进入订货系统
        </el-button>
      </el-form>
      <p class="muted small">演示密码统一为 Admin@123</p>
    </el-card>
  </div>
</template>
