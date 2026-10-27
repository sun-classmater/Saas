<script setup>
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatNumber } from "../utils/format.js";

const loading = ref(true);
const rows = ref([]);

onMounted(async () => {
  try {
    rows.value = await api("/api/admin/reports/plan-execution");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>计划执行率</template>
    <el-alert
      type="info"
      :closable="false"
      title="执行率 = 已从已审核计划创建的计划订单数量 ÷ 计划数量，临时订单不纳入统计。"
      style="margin-bottom: 14px"
    />
    <el-table :data="rows" stripe>
      <el-table-column prop="planMonth" label="计划月份" width="120" />
      <el-table-column prop="customerName" label="客户" min-width="200" />
      <el-table-column prop="grade" label="等级" width="80" />
      <el-table-column label="计划数量" width="120" align="right">
        <template #default="{ row }">{{ formatNumber(row.plannedQuantity) }}</template>
      </el-table-column>
      <el-table-column label="已下计划单" width="120" align="right">
        <template #default="{ row }">{{ formatNumber(row.orderedQuantity) }}</template>
      </el-table-column>
      <el-table-column label="执行率" width="120" align="right">
        <template #default="{ row }">
          <strong>{{ row.executionRate }}</strong>%
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!rows.length && !loading" description="暂无已审核计划" />
  </el-card>
</template>
