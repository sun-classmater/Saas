<script setup>
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatMoney } from "../utils/format.js";

const loading = ref(true);
const matrix = ref({ tiers: [], products: [], tierPrices: [], customerPrices: [] });
const customers = ref([]);
const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({ scope: "TIER", tier: "", customerId: "", productId: "", price: 0 });

async function refresh() {
  loading.value = true;
  try {
    const [matrixData, customerData] = await Promise.all([
      api("/api/admin/prices"),
      api("/api/admin/customers")
    ]);
    matrix.value = matrixData;
    customers.value = customerData;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, {
    scope: "TIER",
    tier: matrix.value.tiers[0] || "VIP",
    customerId: customers.value[0]?.id || "",
    productId: matrix.value.products[0]?.id || "",
    price: 0
  });
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    const body = {
      scope: form.scope,
      productId: form.productId,
      price: form.price
    };
    if (form.scope === "CUSTOMER") body.customerId = form.customerId;
    else body.tier = form.tier;
    await api("/api/admin/prices", { method: "PUT", body });
    ElMessage.success("价格已更新");
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
  <div v-loading="loading">
    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <div class="card-head">
          <span>价格矩阵</span>
          <el-button type="primary" @click="openCreate">+ 设置价格</el-button>
        </div>
      </template>
      <el-alert
        type="info"
        :closable="false"
        title="客户专属价优先于价格等级价；两者都不存在时产品会对客户隐藏。"
        style="margin-bottom: 14px"
      />
      <el-tabs>
        <el-tab-pane label="等级价">
          <el-table :data="matrix.tierPrices" stripe>
            <el-table-column prop="tier" label="价格等级" width="120" />
            <el-table-column prop="sku" label="物料号" width="140" />
            <el-table-column prop="productName" label="产品" min-width="180" />
            <el-table-column label="价格" width="120" align="right">
              <template #default="{ row }">{{ formatMoney(row.price) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="客户专属价">
          <el-table :data="matrix.customerPrices" stripe>
            <el-table-column prop="customerName" label="客户" min-width="180" />
            <el-table-column prop="sku" label="物料号" width="140" />
            <el-table-column prop="productName" label="产品" min-width="180" />
            <el-table-column label="价格" width="120" align="right">
              <template #default="{ row }">{{ formatMoney(row.price) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="dialogVisible" title="设置价格" width="520px">
      <el-form label-width="100px">
        <el-form-item label="价格范围">
          <el-radio-group v-model="form.scope">
            <el-radio-button value="TIER">价格等级</el-radio-button>
            <el-radio-button value="CUSTOMER">指定客户</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.scope === 'TIER'" label="价格等级">
          <el-select v-model="form.tier" style="width: 100%">
            <el-option v-for="tier in matrix.tiers" :key="tier" :label="tier" :value="tier" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="客户">
          <el-select v-model="form.customerId" filterable style="width: 100%">
            <el-option v-for="item in customers" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品">
          <el-select v-model="form.productId" filterable style="width: 100%">
            <el-option v-for="item in matrix.products" :key="item.id" :label="`${item.name}（${item.sku}）`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="价格">
          <el-input-number v-model="form.price" :min="0.01" :precision="2" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
