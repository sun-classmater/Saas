<script setup>
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatDate, formatMoney, name, tagType } from "../utils/format.js";

const loading = ref(true);
const payments = ref([]);

const summary = computed(() => {
  const succeeded = payments.value.filter((item) => item.status === "SUCCEEDED");
  return {
    total: succeeded.reduce((sum, item) => sum + Number(item.amount), 0),
    pending: payments.value.filter((item) => item.status === "PENDING").length,
    count: succeeded.length
  };
});

onMounted(async () => {
  try {
    payments.value = await api("/api/admin/payments");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div v-loading="loading">
    <div class="metric-grid" style="margin-bottom: 16px">
      <el-card shadow="never">
        <p class="muted">累计到账</p>
        <h3>{{ formatMoney(summary.total) }}</h3>
        <span class="muted">成功支付 {{ summary.count }} 笔</span>
      </el-card>
      <el-card shadow="never">
        <p class="muted">待支付</p>
        <h3>{{ summary.pending }}</h3>
        <span class="muted">客户尚未完成支付</span>
      </el-card>
      <el-card shadow="never">
        <p class="muted">支付渠道</p>
        <h3>微信支付</h3>
        <span class="muted">mock / 正式取决于环境配置</span>
      </el-card>
    </div>
    <el-card shadow="never">
      <template #header>收款记录</template>
      <el-table :data="payments" stripe>
        <el-table-column prop="paymentNo" label="支付单号" min-width="200" />
        <el-table-column prop="orderNo" label="订单号" min-width="180" />
        <el-table-column prop="customerName" label="客户" min-width="180" />
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="tagType(row.status)" size="small">{{ name(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="到账时间" width="160">
          <template #default="{ row }">{{ formatDate(row.paidAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
