<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api } from "../api/client.js";
import { useAuthStore } from "../stores/auth.js";
import { formatDate, formatMoney, name, tagType } from "../utils/format.js";

const auth = useAuthStore();
const loading = ref(true);
const orders = ref([]);
const keyword = ref("");
const statusFilter = ref("");

const drawerVisible = ref(false);
const detail = ref(null);
const detailLoading = ref(false);

const shipVisible = ref(false);
const shipForm = reactive({ logisticsCompany: "顺丰速运", trackingNo: "", dispatchLocation: "上海总仓", items: [] });
const payVisible = ref(false);
const payAmount = ref(0);
const acting = ref(false);

const statusOptions = [
  ["PENDING_BANGBANG", "待邦邦确认"],
  ["PENDING_PAYMENT", "待付款"],
  ["PENDING_SANLEI", "待接单"],
  ["PREPARING", "备货中"],
  ["PARTIALLY_SHIPPED", "部分发货"],
  ["SHIPPED", "已发货"],
  ["COMPLETED", "已完成"],
  ["CANCELLED", "已取消"]
];

const filtered = computed(() => {
  let rows = orders.value;
  if (statusFilter.value) rows = rows.filter((item) => item.status === statusFilter.value);
  const word = keyword.value.trim().toLowerCase();
  if (word) {
    rows = rows.filter((item) =>
      [item.orderNo, item.customerName, item.vehicleModel].some((value) =>
        String(value || "").toLowerCase().includes(word)
      )
    );
  }
  return rows;
});

const canConfirm = computed(() =>
  detail.value?.status === "PENDING_BANGBANG" && ["SUPER_ADMIN", "BANGBANG_OPS"].includes(auth.user?.role)
);
const canAccept = computed(() =>
  detail.value?.status === "PENDING_SANLEI" && ["SUPER_ADMIN", "SANLEI_SALES"].includes(auth.user?.role)
);
const canShip = computed(() =>
  ["PREPARING", "PARTIALLY_SHIPPED"].includes(detail.value?.status) &&
  ["SUPER_ADMIN", "SANLEI_WAREHOUSE"].includes(auth.user?.role)
);
const canMockPay = computed(() =>
  detail.value?.settlementMethod === "PREPAY" &&
  ["PENDING_PAYMENT", "PARTIALLY_PAID", "PARTIALLY_SHIPPED"].includes(detail.value?.status) &&
  auth.user?.role === "SUPER_ADMIN"
);
const canCancel = computed(() =>
  detail.value &&
  !["COMPLETED", "CANCELLED", "SHIPPED"].includes(detail.value.status) &&
  Number(detail.value.paidAmount) === 0
);

async function refresh() {
  loading.value = true;
  try {
    orders.value = await api("/api/admin/orders");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function openDetail(rowOrId) {
  const id = typeof rowOrId === "string" ? rowOrId : rowOrId.id;
  drawerVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await api(`/api/admin/orders/${id}`);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    detailLoading.value = false;
  }
}

async function act(action, extra = {}) {
  if (acting.value) return;
  acting.value = true;
  try {
    await api(`/api/admin/orders/${detail.value.id}/actions`, {
      method: "POST",
      body: { action, ...extra }
    });
    ElMessage.success("订单状态已更新");
    await refresh();
    await openDetail(detail.value.id);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    acting.value = false;
  }
}

function openShip() {
  shipForm.trackingNo = "";
  shipForm.items = (detail.value.items || [])
    .filter((item) => item.remainingQuantity > 0)
    .map((item) => ({
      orderItemId: item.id,
      name: item.name,
      remaining: item.remainingQuantity,
      quantity: item.remainingQuantity
    }));
  shipVisible.value = true;
}

async function submitShip() {
  const items = shipForm.items.filter((item) => Number(item.quantity) > 0);
  if (!items.length) {
    ElMessage.warning("请选择本批发货数量");
    return;
  }
  await act("SHIP", {
    shipment: {
      logisticsCompany: shipForm.logisticsCompany,
      trackingNo: shipForm.trackingNo,
      dispatchLocation: shipForm.dispatchLocation,
      items: items.map((item) => ({ orderItemId: item.orderItemId, quantity: Number(item.quantity) }))
    }
  });
  shipVisible.value = false;
}

function openPay() {
  payAmount.value = Math.max(0, Number(detail.value.totalAmount) - Number(detail.value.paidAmount));
  payVisible.value = true;
}

async function submitPay() {
  if (!payAmount.value || payAmount.value <= 0) {
    ElMessage.warning("请输入支付金额");
    return;
  }
  acting.value = true;
  try {
    await api("/api/admin/payments/mock", {
      method: "POST",
      body: { orderId: detail.value.id, amount: payAmount.value }
    });
    ElMessage.success("模拟支付已到账");
    payVisible.value = false;
    await refresh();
    await openDetail(detail.value.id);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    acting.value = false;
  }
}

async function cancelOrder() {
  try {
    await ElMessageBox.confirm("取消后会释放已预占库存，且不可恢复。", "确认取消订单", { type: "warning" });
  } catch {
    return;
  }
  await act("CANCEL", { reason: "后台取消" });
}

onMounted(refresh);
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="card-head">
        <div style="display: flex; gap: 12px; align-items: center">
          <el-input v-model="keyword" placeholder="搜索订单号 / 客户 / 车型" clearable style="width: 280px" />
          <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 160px">
            <el-option v-for="[value, label] in statusOptions" :key="value" :label="label" :value="value" />
          </el-select>
        </div>
        <span class="muted">最多展示最近 500 张子订单</span>
      </div>
    </template>
    <el-table :data="filtered" stripe>
      <el-table-column prop="orderNo" label="订单号" min-width="180" />
      <el-table-column prop="groupNo" label="总单号" min-width="170" />
      <el-table-column prop="customerName" label="客户" min-width="170" />
      <el-table-column prop="vehicleModel" label="车型" width="110" />
      <el-table-column label="类型" width="110">
        <template #default="{ row }">{{ name(row.orderType) }}</template>
      </el-table-column>
      <el-table-column label="金额" width="120" align="right">
        <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
      </el-table-column>
      <el-table-column label="已付" width="110" align="right">
        <template #default="{ row }">{{ formatMoney(row.paidAmount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="tagType(row.status)" size="small">{{ name(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="150">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-drawer v-model="drawerVisible" size="640px" :title="detail ? `订单 ${detail.orderNo}` : '订单详情'">
    <div v-loading="detailLoading">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="客户">{{ detail.customerName }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="tagType(detail.status)" size="small">{{ name(detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="车型">{{ detail.vehicleModel }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ name(detail.orderType) }} / {{ name(detail.settlementMethod) }}</el-descriptions-item>
          <el-descriptions-item label="订单金额">{{ formatMoney(detail.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="已付 / 已发">
            {{ formatMoney(detail.paidAmount) }} / {{ formatMoney(detail.shippedAmount) }}
          </el-descriptions-item>
          <el-descriptions-item label="预付款门槛">
            {{ Math.round(detail.prepayRatio * 100) }}% · 最多 {{ detail.batchLimit }} 批
          </el-descriptions-item>
          <el-descriptions-item label="总单">{{ detail.groupNo }}</el-descriptions-item>
          <el-descriptions-item label="客户备注" :span="2">{{ detail.customerNote || "—" }}</el-descriptions-item>
        </el-descriptions>

        <div style="display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap">
          <el-button v-if="canConfirm" type="primary" :loading="acting" @click="act('BANGBANG_CONFIRM')">邦邦确认</el-button>
          <el-button v-if="canAccept" type="primary" :loading="acting" @click="act('SANLEI_ACCEPT')">三磊接单</el-button>
          <el-button v-if="canShip" type="primary" @click="openShip">创建发货批次</el-button>
          <el-button v-if="canMockPay" @click="openPay">模拟客户支付</el-button>
          <el-button v-if="canCancel" type="danger" plain :loading="acting" @click="cancelOrder">取消订单</el-button>
        </div>

        <h4>产品明细</h4>
        <el-table :data="detail.items" size="small">
          <el-table-column prop="name" label="产品" min-width="160" />
          <el-table-column label="单价" width="100" align="right">
            <template #default="{ row }">{{ formatMoney(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" width="70" align="right" />
          <el-table-column prop="reservedQuantity" label="预占" width="70" align="right" />
          <el-table-column prop="shippedQuantity" label="已发" width="70" align="right" />
        </el-table>

        <h4>支付记录</h4>
        <el-table :data="detail.payments" size="small">
          <el-table-column prop="paymentNo" label="支付单号" min-width="170" />
          <el-table-column label="金额" width="100" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="tagType(row.status)" size="small">{{ name(row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!detail.payments.length" description="暂无支付记录" :image-size="60" />

        <h4>发货批次</h4>
        <el-table :data="detail.shipments" size="small">
          <el-table-column prop="batchNo" label="批次" width="70" />
          <el-table-column prop="summary" label="内容" min-width="180" />
          <el-table-column prop="logisticsCompany" label="物流" width="110" />
          <el-table-column label="金额" width="100" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!detail.shipments.length" description="暂无发货记录" :image-size="60" />
      </template>
    </div>
  </el-drawer>

  <el-dialog v-model="shipVisible" title="创建发货批次" width="560px">
    <el-form label-width="100px">
      <el-form-item label="物流公司"><el-input v-model="shipForm.logisticsCompany" /></el-form-item>
      <el-form-item label="运单号"><el-input v-model="shipForm.trackingNo" /></el-form-item>
      <el-form-item label="发货地点"><el-input v-model="shipForm.dispatchLocation" /></el-form-item>
    </el-form>
    <el-table :data="shipForm.items" size="small">
      <el-table-column prop="name" label="产品" min-width="160" />
      <el-table-column prop="remaining" label="未发" width="80" align="right" />
      <el-table-column label="本批数量" width="140">
        <template #default="{ row }">
          <el-input-number v-model="row.quantity" :min="0" :max="row.remaining" size="small" />
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="shipVisible = false">取消</el-button>
      <el-button type="primary" :loading="acting" @click="submitShip">确认发货</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="payVisible" title="模拟客户支付" width="420px">
    <el-form label-width="90px">
      <el-form-item label="支付金额">
        <el-input-number v-model="payAmount" :min="0.01" :precision="2" style="width: 100%" />
      </el-form-item>
    </el-form>
    <p class="muted">仅测试模式可用；会立即计入已付金额并推进订单状态。</p>
    <template #footer>
      <el-button @click="payVisible = false">取消</el-button>
      <el-button type="primary" :loading="acting" @click="submitPay">确认到账</el-button>
    </template>
  </el-dialog>
</template>
