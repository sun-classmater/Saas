<script setup>
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";

const loading = ref(true);
const rows = ref([]);
const previewVisible = ref(false);
const preview = ref(null);
const previewLoading = ref(false);
const targets = ref([]);
const applying = ref(false);

async function refresh() {
  loading.value = true;
  try {
    rows.value = await api("/api/admin/shortages");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function openPreview(row) {
  previewVisible.value = true;
  previewLoading.value = true;
  try {
    preview.value = await api(`/api/admin/shortages/${row.productId}/preview`);
    targets.value = preview.value.candidates.map((item) => ({
      orderItemId: item.orderItemId,
      quantity: item.suggestedQuantity
    }));
  } catch (error) {
    ElMessage.error(error.message);
    previewVisible.value = false;
  } finally {
    previewLoading.value = false;
  }
}

function suggestedFor(orderItemId) {
  return preview.value?.candidates.find((item) => item.orderItemId === orderItemId) || {};
}

async function apply() {
  applying.value = true;
  try {
    await api(`/api/admin/shortages/${preview.value.product.id}/apply`, {
      method: "POST",
      body: {
        targets: targets.value.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: Number(item.quantity)
        }))
      }
    });
    ElMessage.success("分配已确认，库存预占已重算");
    previewVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    applying.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="card-head">
        <span>缺货产品</span>
        <span class="muted">待履约需求 &gt; 当前可用库存</span>
      </div>
    </template>
    <el-alert
      type="info"
      :closable="false"
      title="加权公平分配：预付款与客户等级优先，同时兼顾渠道、授信、近三月采购与订单紧急度；确认后重算预占并留痕。"
      style="margin-bottom: 14px"
    />
    <el-table :data="rows" stripe>
      <el-table-column prop="sku" label="物料号" width="140" />
      <el-table-column prop="name" label="产品" min-width="180" />
      <el-table-column prop="vehicleModel" label="车型" width="120" />
      <el-table-column prop="available" label="可用库存" width="100" align="right" />
      <el-table-column prop="pendingDemand" label="待履约需求" width="120" align="right" />
      <el-table-column label="缺口" width="90" align="right">
        <template #default="{ row }">
          <strong style="color: var(--el-color-danger)">{{ row.shortage }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110">
        <template #default="{ row }">
          <el-button link type="primary" @click="openPreview(row)">分配预览</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!rows.length && !loading" description="当前没有缺货产品" />
  </el-card>

  <el-dialog v-model="previewVisible" title="缺货公平分配预览" width="820px">
    <div v-loading="previewLoading">
      <template v-if="preview">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="产品">{{ preview.product.name }}</el-descriptions-item>
          <el-descriptions-item label="物理库存">{{ preview.physicalStock }}</el-descriptions-item>
          <el-descriptions-item label="未满足需求">{{ preview.unallocatedDemand }}</el-descriptions-item>
        </el-descriptions>
        <p class="muted">策略：{{ preview.strategy.name }}</p>
        <el-table :data="preview.candidates" size="small">
          <el-table-column prop="orderNo" label="订单号" min-width="160" />
          <el-table-column prop="customerName" label="客户" min-width="150" />
          <el-table-column prop="grade" label="等级" width="70" />
          <el-table-column prop="remainingQuantity" label="剩余需求" width="90" align="right" />
          <el-table-column label="建议分配" width="120" align="right">
            <template #default="{ row }">{{ suggestedFor(row.orderItemId).suggestedQuantity }}</template>
          </el-table-column>
          <el-table-column label="人工调整" width="140">
            <template #default="{ $index }">
              <el-input-number
                v-model="targets[$index].quantity"
                :min="0"
                :max="preview.candidates[$index].remainingQuantity"
                size="small"
              />
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>
    <template #footer>
      <el-button @click="previewVisible = false">取消</el-button>
      <el-button type="primary" :loading="applying" @click="apply">确认分配</el-button>
    </template>
  </el-dialog>
</template>
