<script setup>
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { api, getToken } from "../api/client.js";

const importing = ref("");
const currentKind = ref("");
const fileInput = ref(null);
const kinds = [
  { key: "customers", title: "客户档案", description: "客户编码、渠道、等级、账期、授信额度与预付款规则" },
  { key: "products", title: "产品档案", description: "物料号、品名、分类、车型、最小包装与质保信息" },
  { key: "prices", title: "价格矩阵", description: "按价格等级或客户编码批量设置产品价格" },
  { key: "inventory", title: "期初库存", description: "真实库存与供应商虚拟库存" }
];
const exports = [
  { key: "orders", title: "订单导出" },
  { key: "inventory", title: "库存导出" },
  { key: "payments", title: "收款导出" },
  { key: "plans", title: "采购计划导出" }
];

async function download(path, filename) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) {
    let message = "下载失败";
    try {
      const data = await response.json();
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    ElMessage.error(message);
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTemplate(kind, format) {
  download(`/api/admin/import-templates/${kind}/${format}`, `${kind}-template.${format}`);
}

function downloadExport(kind) {
  download(`/api/admin/exports/${kind}/xlsx`, `${kind}.xlsx`);
}

function pick(kind) {
  currentKind.value = kind;
  fileInput.value?.click();
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function onFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const kind = currentKind.value;
  importing.value = kind;
  try {
    let result;
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      result = await api(`/api/admin/imports/${kind}/xlsx`, {
        method: "POST",
        body: { fileBase64: toBase64(await file.arrayBuffer()) }
      });
    } else {
      result = await api(`/api/admin/imports/${kind}`, { method: "POST", text: await file.text() });
    }
    ElMessage.success(`导入成功：${result.imported} 行`);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    importing.value = "";
  }
}
</script>

<template>
  <div>
    <input ref="fileInput" type="file" accept=".xlsx,.csv" hidden @change="onFileChange" />
    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>导出数据</template>
      <div class="import-grid">
        <div v-for="item in exports" :key="item.key" class="import-card">
          <div>
            <h4>{{ item.title }}</h4>
            <p class="muted">导出标准 Excel，可直接用于对账或归档。</p>
          </div>
          <el-button @click="downloadExport(item.key)">下载 Excel</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <span>导入数据</span>
        <span class="muted" style="margin-left: 10px">支持 .xlsx 与 CSV；任意一行失败整批回滚</span>
      </template>
      <div class="import-grid">
        <div v-for="item in kinds" :key="item.key" class="import-card">
          <div>
            <h4>{{ item.title }}</h4>
            <p class="muted">{{ item.description }}</p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <el-button size="small" @click="downloadTemplate(item.key, 'xlsx')">下载模板</el-button>
            <el-button size="small" type="primary" :loading="importing === item.key" @click="pick(item.key)">
              导入文件
            </el-button>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>
