<script setup>
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatDate } from "../utils/format.js";

const loading = ref(true);
const rows = ref([]);
const keyword = ref("");

const filtered = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  if (!text) return rows.value;
  return rows.value.filter((row) =>
    [row.userName, row.action, row.entityType, row.entityId, row.details]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(text))
  );
});

async function refresh() {
  loading.value = true;
  try {
    rows.value = await api("/api/admin/audit-logs");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function prettyDetails(row) {
  if (!row.details) return "";
  try {
    return JSON.stringify(JSON.parse(row.details), null, 2);
  } catch {
    return String(row.details);
  }
}

onMounted(refresh);
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="card-head">
        <span>审计日志</span>
        <div style="display: flex; gap: 8px">
          <el-input v-model="keyword" placeholder="按操作人 / 动作 / 实体筛选" clearable style="width: 240px" />
          <el-button @click="refresh">刷新</el-button>
        </div>
      </div>
    </template>
    <el-alert
      type="info"
      :closable="false"
      title="记录关键写操作：下单、确认、接单、发货、收款、财务与账号变更；仅超级管理员可见，最多返回最近 500 条。"
      style="margin-bottom: 14px"
    />
    <el-table :data="filtered" stripe>
      <el-table-column prop="createdAt" label="时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="userName" label="操作人" width="120" />
      <el-table-column prop="action" label="动作" width="200">
        <template #default="{ row }">
          <el-tag size="small">{{ row.action }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="entityType" label="对象类型" width="130" />
      <el-table-column prop="entityId" label="对象 ID" width="200" show-overflow-tooltip />
      <el-table-column label="明细" min-width="240">
        <template #default="{ row }">
          <span v-if="!row.details" class="muted">—</span>
          <el-popover v-else placement="left" :width="380" trigger="click">
            <template #reference>
              <el-button text size="small">查看</el-button>
            </template>
            <pre class="audit-json">{{ prettyDetails(row) }}</pre>
          </el-popover>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!filtered.length && !loading" description="暂无审计记录" />
  </el-card>
</template>

<style scoped>
.audit-json {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
