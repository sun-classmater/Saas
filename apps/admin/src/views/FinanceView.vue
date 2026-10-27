<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatDate, formatMoney, name, tagType } from "../utils/format.js";

const loading = ref(true);
const finance = ref({ invoices: [], freight: [], adjustments: [] });
const orders = ref([]);
const customers = ref([]);
const saving = ref(false);

const invoiceVisible = ref(false);
const invoiceForm = reactive({ orderId: "", title: "", taxNumber: "", amount: null, taxRate: 13, note: "" });
const freightVisible = ref(false);
const freightForm = reactive({ orderId: "", amount: null, payer: "CUSTOMER", description: "物流运费" });
const adjustmentVisible = ref(false);
const adjustmentForm = reactive({ customerId: "", orderId: "", type: "CLAIM", amount: null, description: "" });

const pendingFreight = computed(() =>
  finance.value.freight.filter((item) => item.status !== "SETTLED").reduce((sum, item) => sum + Number(item.amount), 0)
);
const pendingAdjustment = computed(() =>
  finance.value.adjustments.filter((item) => item.status !== "SETTLED").reduce((sum, item) => sum + Number(item.amount), 0)
);

async function refresh() {
  loading.value = true;
  try {
    const [financeData, orderData, customerData] = await Promise.all([
      api("/api/admin/finance"),
      api("/api/admin/orders"),
      api("/api/admin/customers")
    ]);
    finance.value = financeData;
    orders.value = orderData;
    customers.value = customerData;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openInvoice() {
  Object.assign(invoiceForm, {
    orderId: orders.value[0]?.id || "",
    title: "",
    taxNumber: "",
    amount: orders.value[0]?.totalAmount ?? null,
    taxRate: 13,
    note: ""
  });
  invoiceVisible.value = true;
}

async function saveInvoice() {
  saving.value = true;
  try {
    await api("/api/admin/finance/invoices", { method: "POST", body: { ...invoiceForm } });
    ElMessage.success("开票记录已创建");
    invoiceVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function issueInvoice(row) {
  try {
    await api(`/api/admin/finance/invoices/${row.id}/status`, { method: "POST", body: { status: "ISSUED" } });
    ElMessage.success("已标记开票");
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

function openFreight() {
  Object.assign(freightForm, {
    orderId: orders.value[0]?.id || "",
    amount: null,
    payer: "CUSTOMER",
    description: "物流运费"
  });
  freightVisible.value = true;
}

async function saveFreight() {
  saving.value = true;
  try {
    await api("/api/admin/finance/freight", { method: "POST", body: { ...freightForm } });
    ElMessage.success("运费记录已创建");
    freightVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

function openAdjustment() {
  Object.assign(adjustmentForm, {
    customerId: customers.value[0]?.id || "",
    orderId: "",
    type: "CLAIM",
    amount: null,
    description: ""
  });
  adjustmentVisible.value = true;
}

async function saveAdjustment() {
  saving.value = true;
  try {
    const body = { ...adjustmentForm, orderId: adjustmentForm.orderId || undefined };
    await api("/api/admin/finance/adjustments", { method: "POST", body });
    ElMessage.success("调整款已登记");
    adjustmentVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function settle(kind, row) {
  try {
    await api(`/api/admin/finance/${kind}/${row.id}/settle`, { method: "POST", body: {} });
    ElMessage.success("结算状态已更新");
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

onMounted(refresh);
</script>

<template>
  <div v-loading="loading">
    <div class="metric-grid" style="margin-bottom: 16px">
      <el-card shadow="never">
        <p class="muted">待开票</p>
        <h3>{{ finance.invoices.filter((item) => item.status === "PENDING").length }}</h3>
      </el-card>
      <el-card shadow="never">
        <p class="muted">累计开票</p>
        <h3>
          {{ formatMoney(finance.invoices.filter((item) => item.status === "ISSUED").reduce((sum, item) => sum + Number(item.amount), 0)) }}
        </h3>
      </el-card>
      <el-card shadow="never">
        <p class="muted">待结运费</p>
        <h3>{{ formatMoney(pendingFreight) }}</h3>
      </el-card>
      <el-card shadow="never">
        <p class="muted">待结调整款</p>
        <h3>{{ formatMoney(pendingAdjustment) }}</h3>
      </el-card>
    </div>

    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <div class="card-head">
          <span>发票记录</span>
          <el-button type="primary" @click="openInvoice">+ 登记开票</el-button>
        </div>
      </template>
      <el-table :data="finance.invoices" stripe>
        <el-table-column prop="recordNo" label="发票号" width="170" />
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column prop="customerName" label="客户" min-width="150" />
        <el-table-column prop="title" label="抬头" min-width="150" />
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="taxRate" label="税率" width="80" align="right" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="tagType(row.status)" size="small">{{ name(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-button v-if="row.status === 'PENDING'" link type="primary" @click="issueInvoice(row)">标记开票</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">
      <el-card shadow="never">
        <template #header>
          <div class="card-head">
            <span>运费结算</span>
            <el-button size="small" @click="openFreight">+ 运费</el-button>
          </div>
        </template>
        <el-table :data="finance.freight" size="small">
          <el-table-column prop="orderNo" label="订单" width="160" />
          <el-table-column prop="customerName" label="客户" min-width="120" />
          <el-table-column label="金额" width="100" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="承担" width="80">
            <template #default="{ row }">{{ row.payer === "COMPANY" ? "公司" : "客户" }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button v-if="row.status !== 'SETTLED'" link type="primary" @click="settle('freight', row)">结算</el-button>
              <span v-else class="muted">已结算</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="card-head">
            <span>调整款</span>
            <el-button size="small" @click="openAdjustment">+ 调整款</el-button>
          </div>
        </template>
        <el-table :data="finance.adjustments" size="small">
          <el-table-column prop="recordNo" label="单号" width="150" />
          <el-table-column prop="customerName" label="客户" min-width="120" />
          <el-table-column label="金额" width="100" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button v-if="row.status !== 'SETTLED'" link type="primary" @click="settle('adjustment', row)">结算</el-button>
              <span v-else class="muted">已结算</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>

  <el-dialog v-model="invoiceVisible" title="登记开票" width="520px">
    <el-form label-width="100px">
      <el-form-item label="订单">
        <el-select v-model="invoiceForm.orderId" filterable style="width: 100%">
          <el-option
            v-for="order in orders"
            :key="order.id"
            :label="`${order.orderNo} · ${order.customerName} · ${formatMoney(order.totalAmount)}`"
            :value="order.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="发票抬头"><el-input v-model="invoiceForm.title" /></el-form-item>
      <el-form-item label="税号"><el-input v-model="invoiceForm.taxNumber" /></el-form-item>
      <el-form-item label="开票金额"><el-input-number v-model="invoiceForm.amount" :min="0.01" :precision="2" style="width: 100%" /></el-form-item>
      <el-form-item label="税率（%）"><el-input-number v-model="invoiceForm.taxRate" :min="0" :max="100" /></el-form-item>
      <el-form-item label="备注"><el-input v-model="invoiceForm.note" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="invoiceVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveInvoice">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="freightVisible" title="登记运费" width="480px">
    <el-form label-width="100px">
      <el-form-item label="订单">
        <el-select v-model="freightForm.orderId" filterable style="width: 100%">
          <el-option v-for="order in orders" :key="order.id" :label="`${order.orderNo} · ${order.customerName}`" :value="order.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="运费金额"><el-input-number v-model="freightForm.amount" :min="0.01" :precision="2" style="width: 100%" /></el-form-item>
      <el-form-item label="承担方">
        <el-radio-group v-model="freightForm.payer">
          <el-radio value="CUSTOMER">客户承担</el-radio>
          <el-radio value="COMPANY">公司承担</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="说明"><el-input v-model="freightForm.description" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="freightVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveFreight">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="adjustmentVisible" title="登记调整款" width="520px">
    <el-form label-width="110px">
      <el-form-item label="客户">
        <el-select v-model="adjustmentForm.customerId" filterable style="width: 100%">
          <el-option v-for="item in customers" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="关联订单（可选）">
        <el-select v-model="adjustmentForm.orderId" clearable filterable style="width: 100%">
          <el-option v-for="order in orders" :key="order.id" :label="`${order.orderNo} · ${order.customerName}`" :value="order.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="adjustmentForm.type" style="width: 100%">
          <el-option label="索赔款" value="CLAIM" />
          <el-option label="退货款" value="RETURN_REFUND" />
          <el-option label="运费调整" value="FREIGHT_ADJUSTMENT" />
          <el-option label="其他" value="OTHER" />
        </el-select>
      </el-form-item>
      <el-form-item label="金额"><el-input-number v-model="adjustmentForm.amount" :precision="2" style="width: 100%" /></el-form-item>
      <el-form-item label="说明"><el-input v-model="adjustmentForm.description" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="adjustmentVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveAdjustment">保存</el-button>
    </template>
  </el-dialog>
</template>
