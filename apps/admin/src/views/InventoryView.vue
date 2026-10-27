<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatDate, name } from "../utils/format.js";

const loading = ref(true);
const rows = ref([]);
const movements = ref([]);
const keyword = ref("");
const lowOnly = ref(false);

const adjustVisible = ref(false);
const adjustForm = reactive({ row: null, quantity: 0, note: "库存盘点调整" });
const transferVisible = ref(false);
const transferForm = reactive({ row: null, destinationId: "", quantity: 1, note: "仓间调拨" });
const saving = ref(false);

const filtered = computed(() => {
  let list = rows.value;
  if (lowOnly.value) list = list.filter((item) => item.available <= 20);
  const word = keyword.value.trim().toLowerCase();
  if (word) {
    list = list.filter((item) =>
      [item.sku, item.name, item.warehouseName].some((value) =>
        String(value || "").toLowerCase().includes(word)
      )
    );
  }
  return list;
});

async function refresh() {
  loading.value = true;
  try {
    const [inventory, movementRows] = await Promise.all([
      api("/api/admin/inventory"),
      api("/api/admin/inventory/movements")
    ]);
    rows.value = inventory;
    movements.value = movementRows;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openAdjust(row) {
  adjustForm.row = row;
  adjustForm.quantity = 0;
  adjustForm.note = "库存盘点调整";
  adjustVisible.value = true;
}

async function submitAdjust() {
  if (!adjustForm.quantity) {
    ElMessage.warning("调整数量不能为 0");
    return;
  }
  saving.value = true;
  try {
    await api(`/api/admin/inventory/${adjustForm.row.id}/adjust`, {
      method: "POST",
      body: { quantity: adjustForm.quantity, note: adjustForm.note }
    });
    ElMessage.success("库存已调整");
    adjustVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

function openTransfer(row) {
  const destinations = rows.value.filter((item) => item.productId === row.productId && item.id !== row.id);
  if (!destinations.length) {
    ElMessage.warning("该产品没有其他仓库可作为移库目标");
    return;
  }
  transferForm.row = row;
  transferForm.destinationId = destinations[0].id;
  transferForm.quantity = 1;
  transferForm.note = "仓间调拨";
  transferVisible.value = true;
}

const destinations = computed(() => {
  if (!transferForm.row) return [];
  return rows.value.filter(
    (item) => item.productId === transferForm.row.productId && item.id !== transferForm.row.id
  );
});

async function submitTransfer() {
  saving.value = true;
  try {
    await api("/api/admin/inventory/transfer", {
      method: "POST",
      body: {
        sourceId: transferForm.row.id,
        destinationId: transferForm.destinationId,
        quantity: transferForm.quantity,
        note: transferForm.note
      }
    });
    ElMessage.success("移库已完成");
    transferVisible.value = false;
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
  <div v-loading="loading">
    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <div class="card-head">
          <div style="display: flex; gap: 12px; align-items: center">
            <el-input v-model="keyword" placeholder="搜索物料号 / 产品 / 仓库" clearable style="width: 280px" />
            <el-checkbox v-model="lowOnly">只看低库存（≤20）</el-checkbox>
          </div>
          <span class="muted">可用 = 实物 − 已预占；真实库存优先占用</span>
        </div>
      </template>
      <el-table :data="filtered" stripe>
        <el-table-column prop="sku" label="物料号" width="130" />
        <el-table-column prop="name" label="产品" min-width="170" />
        <el-table-column prop="warehouseName" label="仓库" width="130" />
        <el-table-column label="来源" width="100">
          <template #default="{ row }">{{ name(row.sourceType) }}</template>
        </el-table-column>
        <el-table-column prop="quantity" label="总量" width="80" align="right" />
        <el-table-column prop="reserved" label="预占" width="80" align="right" />
        <el-table-column label="可用" width="80" align="right">
          <template #default="{ row }">
            <strong :style="{ color: row.available <= 20 ? 'var(--el-color-danger)' : 'var(--el-color-success)' }">
              {{ row.available }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="150">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openAdjust(row)">调整</el-button>
            <el-button link type="primary" @click="openTransfer(row)">移库</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>最近 30 条库存流水</template>
      <el-table :data="movements.slice(0, 30)" size="small">
        <el-table-column prop="sku" label="物料号" width="130" />
        <el-table-column prop="name" label="产品" min-width="150" />
        <el-table-column prop="warehouseName" label="仓库" width="120" />
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column label="数量" width="90" align="right">
          <template #default="{ row }">
            <span :style="{ color: Number(row.quantity) < 0 ? 'var(--el-color-danger)' : '' }">
              {{ Number(row.quantity) > 0 ? "+" : "" }}{{ row.quantity }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="说明" min-width="160" />
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>

  <el-dialog v-model="adjustVisible" title="库存调整" width="460px">
    <p class="muted" v-if="adjustForm.row">
      {{ adjustForm.row.name }} · {{ adjustForm.row.warehouseName }}：总量 {{ adjustForm.row.quantity }}，预占
      {{ adjustForm.row.reserved }}
    </p>
    <el-form label-width="100px" style="margin-top: 12px">
      <el-form-item label="调整数量">
        <el-input-number v-model="adjustForm.quantity" :step="1" style="width: 100%" />
        <span class="muted" style="margin-left: 8px">正数入库 / 负数出库</span>
      </el-form-item>
      <el-form-item label="原因"><el-input v-model="adjustForm.note" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="adjustVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submitAdjust">确认调整</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="transferVisible" title="库存移库" width="480px">
    <p class="muted" v-if="transferForm.row">
      从 {{ transferForm.row.warehouseName }} 移出，可用 {{ transferForm.row.available }}
    </p>
    <el-form label-width="100px" style="margin-top: 12px">
      <el-form-item label="目标仓库">
        <el-select v-model="transferForm.destinationId" style="width: 100%">
          <el-option
            v-for="item in destinations"
            :key="item.id"
            :label="`${item.warehouseName}（${name(item.sourceType)}）`"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="移库数量">
        <el-input-number v-model="transferForm.quantity" :min="1" :max="transferForm.row?.available || 1" />
      </el-form-item>
      <el-form-item label="说明"><el-input v-model="transferForm.note" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="transferVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submitTransfer">确认移库</el-button>
    </template>
  </el-dialog>
</template>
