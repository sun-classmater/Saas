<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { useAuthStore } from "../stores/auth.js";
import { formatDate } from "../utils/format.js";

const auth = useAuthStore();
const loading = ref(true);
const users = ref([]);
const customers = ref([]);

const customerVisible = ref(false);
const customerForm = reactive({ customerId: "", username: "", displayName: "", phone: "" });
const staffVisible = ref(false);
const staffForm = reactive({ username: "", displayName: "", role: "SANLEI_SALES", password: "", phone: "" });
const saving = ref(false);

const isSuper = computed(() => auth.user?.role === "SUPER_ADMIN");
const canCreateCustomer = computed(() => ["SUPER_ADMIN", "BANGBANG_OPS"].includes(auth.user?.role));

async function refresh() {
  loading.value = true;
  try {
    const [userRows, customerRows] = await Promise.all([api("/api/admin/users"), api("/api/admin/customers")]);
    users.value = userRows;
    customers.value = customerRows;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openCustomer() {
  Object.assign(customerForm, {
    customerId: customers.value[0]?.id || "",
    username: "",
    displayName: "",
    phone: ""
  });
  customerVisible.value = true;
}

async function saveCustomer() {
  saving.value = true;
  try {
    await api("/api/admin/users/customer", { method: "POST", body: { ...customerForm } });
    ElMessage.success("客户子账号已创建");
    customerVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

function openStaff() {
  Object.assign(staffForm, { username: "", displayName: "", role: "SANLEI_SALES", password: "", phone: "" });
  staffVisible.value = true;
}

async function saveStaff() {
  saving.value = true;
  try {
    await api("/api/admin/users/staff", { method: "POST", body: { ...staffForm } });
    ElMessage.success("内部账号已创建");
    staffVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function toggle(row) {
  try {
    await api(`/api/admin/users/${row.id}/toggle`, { method: "POST", body: { active: !row.active } });
    ElMessage.success(row.active ? "账号已停用" : "账号已启用");
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

onMounted(refresh);
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="card-head">
        <span>账号权限</span>
        <div style="display: flex; gap: 8px">
          <el-button v-if="canCreateCustomer" @click="openCustomer">+ 客户账号</el-button>
          <el-button v-if="isSuper" type="primary" @click="openStaff">+ 内部账号</el-button>
        </div>
      </div>
    </template>
    <el-table :data="users" stripe>
      <el-table-column prop="username" label="登录名" width="150" />
      <el-table-column prop="displayName" label="姓名" width="140" />
      <el-table-column prop="role" label="角色" width="160" />
      <el-table-column prop="customerName" label="所属客户" min-width="160" />
      <el-table-column prop="phone" label="手机号" width="130" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? "启用" : "停用" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="150">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button v-if="isSuper" link type="primary" @click="toggle(row)">
            {{ row.active ? "停用" : "启用" }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="customerVisible" title="新建客户子账号" width="480px">
    <el-form label-width="100px">
      <el-form-item label="所属客户">
        <el-select v-model="customerForm.customerId" filterable style="width: 100%">
          <el-option v-for="item in customers" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="手机号"><el-input v-model="customerForm.phone" /></el-form-item>
      <el-form-item label="姓名"><el-input v-model="customerForm.displayName" /></el-form-item>
      <el-form-item label="登录名"><el-input v-model="customerForm.username" placeholder="默认使用手机号" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="customerVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveCustomer">创建</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="staffVisible" title="新建内部账号" width="480px">
    <el-form label-width="100px">
      <el-form-item label="登录名"><el-input v-model="staffForm.username" /></el-form-item>
      <el-form-item label="姓名"><el-input v-model="staffForm.displayName" /></el-form-item>
      <el-form-item label="角色">
        <el-select v-model="staffForm.role" style="width: 100%">
          <el-option label="邦邦运营" value="BANGBANG_OPS" />
          <el-option label="邦邦财务" value="BANGBANG_FINANCE" />
          <el-option label="三磊内勤" value="SANLEI_SALES" />
          <el-option label="三磊仓库" value="SANLEI_WAREHOUSE" />
          <el-option label="三磊财务" value="SANLEI_FINANCE" />
          <el-option label="三磊售后" value="SANLEI_AFTERSALES" />
        </el-select>
      </el-form-item>
      <el-form-item label="初始密码"><el-input v-model="staffForm.password" type="password" show-password /></el-form-item>
      <el-form-item label="手机号"><el-input v-model="staffForm.phone" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="staffVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveStaff">创建</el-button>
    </template>
  </el-dialog>
</template>
