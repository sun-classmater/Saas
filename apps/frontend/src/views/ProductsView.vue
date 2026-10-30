<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatMoney } from "../utils/format.js";

const loading = ref(true);
const products = ref([]);
const keyword = ref("");
const dialogVisible = ref(false);
const editing = ref(null);
const form = reactive(emptyForm());
const saving = ref(false);

const filtered = computed(() => {
  const word = keyword.value.trim().toLowerCase();
  if (!word) return products.value;
  return products.value.filter((item) =>
    [item.sku, item.name, item.category, item.vehicleModel].some((value) =>
      String(value || "").toLowerCase().includes(word)
    )
  );
});

function emptyForm() {
  return {
    sku: "",
    name: "",
    category: "",
    vehicleModel: "",
    minPackage: 1,
    basePrice: 100,
    warrantyMonths: 12,
    warrantyKm: 60000,
    active: true,
    description: ""
  };
}

async function refresh() {
  loading.value = true;
  try {
    products.value = await api("/api/admin/products");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  Object.assign(form, emptyForm());
  dialogVisible.value = true;
}

function openEdit(row) {
  editing.value = row;
  Object.assign(form, {
    sku: row.sku,
    name: row.name,
    category: row.category,
    vehicleModel: row.vehicleModel,
    minPackage: row.minPackage,
    basePrice: row.basePrice,
    warrantyMonths: row.warrantyMonths,
    warrantyKm: row.warrantyKm,
    active: row.active,
    description: row.description || ""
  });
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    const payload = { ...form };
    if (editing.value) {
      await api(`/api/admin/products/${editing.value.id}`, { method: "PUT", body: payload });
      ElMessage.success("产品已更新");
    } else {
      await api("/api/admin/products", { method: "POST", body: payload });
      ElMessage.success("产品已创建");
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
        <el-input v-model="keyword" placeholder="搜索物料号 / 产品 / 车型" clearable style="max-width: 320px" />
        <el-button type="primary" @click="openCreate">+ 新建产品</el-button>
      </div>
    </template>
    <el-table :data="filtered" stripe>
      <el-table-column prop="sku" label="物料号" width="140" />
      <el-table-column prop="name" label="产品名称" min-width="180" />
      <el-table-column prop="category" label="分类" width="90" />
      <el-table-column prop="vehicleModel" label="车型" width="110" />
      <el-table-column prop="minPackage" label="最小包装" width="90" align="right" />
      <el-table-column label="基础价" width="110" align="right">
        <template #default="{ row }">{{ formatMoney(row.basePrice) }}</template>
      </el-table-column>
      <el-table-column prop="available" label="可用库存" width="100" align="right" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? "启用" : "停用" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑产品' : '新建产品'" width="640px">
      <el-form label-width="110px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="物料号"><el-input v-model="form.sku" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="产品名称"><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="分类"><el-input v-model="form.category" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="适配车型"><el-input v-model="form.vehicleModel" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="最小包装"><el-input-number v-model="form.minPackage" :min="1" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="基础价"><el-input-number v-model="form.basePrice" :min="0.01" :precision="2" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="状态"><el-switch v-model="form.active" active-text="启用" inactive-text="停用" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="质保月数"><el-input-number v-model="form.warrantyMonths" :min="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="质保公里"><el-input-number v-model="form.warrantyKm" :min="0" :step="10000" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>
