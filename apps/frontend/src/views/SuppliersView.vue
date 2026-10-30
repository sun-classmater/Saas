<script setup>
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { name } from "../utils/format.js";

const loading = ref(true);
const suppliers = ref([]);
const dialogVisible = ref(false);
const editing = ref(null);
const form = reactive({ name: "", type: "INTEGRATOR", contact: "", phone: "", active: true });
const saving = ref(false);

async function refresh() {
  loading.value = true;
  try {
    suppliers.value = await api("/api/admin/suppliers");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  Object.assign(form, { name: "", type: "INTEGRATOR", contact: "", phone: "", active: true });
  dialogVisible.value = true;
}

function openEdit(row) {
  editing.value = row;
  Object.assign(form, {
    name: row.name,
    type: row.type,
    contact: row.contact || "",
    phone: row.phone || "",
    active: row.active
  });
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editing.value) {
      await api(`/api/admin/suppliers/${editing.value.id}`, { method: "PUT", body: { ...form } });
      ElMessage.success("供应商已更新");
    } else {
      await api("/api/admin/suppliers", { method: "POST", body: { ...form } });
      ElMessage.success("供应商已创建");
    }
    dialogVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="card-head">
        <span>供应商档案</span>
        <el-button type="primary" @click="openCreate">+ 新建供应商</el-button>
      </div>
    </template>
    <el-table :data="suppliers" stripe>
      <el-table-column prop="name" label="供应商" min-width="200" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">{{ name(row.type) }}</template>
      </el-table-column>
      <el-table-column prop="contact" label="联系人" width="120" />
      <el-table-column prop="phone" label="电话" width="150" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? "合作中" : "停用" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑供应商' : '新建供应商'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="工厂直供" value="FACTORY" />
            <el-option label="集成供应商" value="INTEGRATOR" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="form.active" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>
