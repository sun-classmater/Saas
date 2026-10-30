<script setup>
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatMoney, name, tagType } from "../utils/format.js";

const loading = ref(true);
const data = ref({ metrics: {}, lowStock: [], recentOrders: [] });

async function refresh() {
  loading.value = true;
  try {
    data.value = await api("/api/admin/dashboard");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <div class="dashboard" v-loading="loading">
    <div class="metric-grid">
      <el-card shadow="never">
        <p class="muted">本月订单金额</p>
        <h3>{{ formatMoney(data.metrics.monthAmount) }}</h3>
        <span class="muted">当前自然月累计</span>
      </el-card>
      <el-card shadow="never">
        <p class="muted">待邦邦确认</p>
        <h3>{{ data.metrics.pendingConfirm ?? 0 }}</h3>
        <span class="muted">客户已提交订单</span>
      </el-card>
      <el-card shadow="never">
        <p class="muted">预付款待收</p>
        <h3>{{ data.metrics.pendingPayment ?? 0 }}</h3>
        <span class="muted">{{ data.metrics.overduePrepay ?? 0 }} 单超过 3 天</span>
      </el-card>
      <el-card shadow="never">
        <p class="muted">履约进行中</p>
        <h3>{{ data.metrics.preparing ?? 0 }}</h3>
        <span class="muted">接单 / 备货 / 部分发货</span>
      </el-card>
    </div>

    <div class="dashboard-grid">
      <el-card shadow="never">
        <template #header>
          <div class="card-head">
            <span>最近订单</span>
            <router-link to="/orders">查看全部</router-link>
          </div>
        </template>
        <el-table :data="data.recentOrders" size="small">
          <el-table-column prop="orderNo" label="订单号" min-width="170" />
          <el-table-column prop="customerName" label="客户" min-width="160" />
          <el-table-column prop="vehicleModel" label="车型" width="110" />
          <el-table-column label="金额" width="120">
            <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="tagType(row.status)" size="small">{{ name(row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>低库存预警</template>
        <el-table :data="data.lowStock" size="small">
          <el-table-column prop="sku" label="物料号" width="120" />
          <el-table-column prop="name" label="产品" min-width="150" />
          <el-table-column prop="available" label="可用" width="80" />
        </el-table>
        <el-empty v-if="!data.lowStock.length" description="暂无低库存" :image-size="70" />
      </el-card>
    </div>
  </div>
</template>
