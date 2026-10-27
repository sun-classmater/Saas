<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { formatMoney, name } from "../utils/format.js";

const loading = ref(true);
const customers = ref([]);
const keyword = ref("");
const dialogVisible = ref(false);
const editing = ref(null);
const saving = ref(false);
const form = reactive(emptyForm());

const authVisible = ref(false);
const authCustomer = ref(null);
const allVehicles = ref([]);
const authorizedVehicles = ref([]);
const authSaving = ref(false);

const pricesVisible = ref(false);
const priceRows = ref([]);
const priceCustomer = ref(null);

const filtered = computed(() => {
  const word = keyword.value.trim().toLowerCase();
  if (!word) return customers.value;
  return customers.value.filter((item) =>
    [item.code, item.name, item.phone].some((value) => String(value || "").toLowerCase().includes(word))
  );
});

function emptyForm() {
  return {
    code: "",
    name: "",
    province: "",
    city: "",
    channelType: "WHOLESALER",
    grade: "A",
    priceTier: "VIP",
    settlementMethod: "CREDIT",
    paymentTermsDays: 30,
    creditLimit: 20000,
    prepayRatio: 1,
    batchLimit: 3,
    phone: "",
    address: "",
    notes: "",
    active: true,
    allowOverpayment: false
  };
}

async function refresh() {
  loading.value = true;
  try {
    customers.value = await api("/api/admin/customers");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  Object.assign(form, emptyForm());
  dialogVisible.value = true;
}

function openEdit(row) {
  editing.value = row;
  Object.assign(form, {
    code: row.code,
    name: row.name,
    province: row.province || "",
    city: row.city || "",
    channelType: row.channelType,
    grade: row.grade,
    priceTier: row.priceTier,
    settlementMethod: row.settlementMethod,
    paymentTermsDays: row.paymentTermsDays,
    creditLimit: row.creditLimit,
    prepayRatio: row.prepayRatio,
    batchLimit: row.batchLimit,
    phone: row.phone || "",
    address: row.address || "",
    notes: row.notes || "",
    active: row.active,
    allowOverpayment: row.allowOverpayment
  });
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    const body = { ...form };
    if (editing.value) {
      await api(`/api/admin/customers/${editing.value.id}`, { method: "PUT", body });
      ElMessage.success("客户已更新");
    } else {
      await api("/api/admin/customers", { method: "POST", body });
      ElMessage.success("客户已创建");
    }
    dialogVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function openAuth(row) {
  authCustomer.value = row;
  try {
    const data = await api(`/api/admin/customers/${row.id}/authorizations`);
    allVehicles.value = data.allVehicles;
    authorizedVehicles.value = [...data.authorizedVehicles];
    authVisible.value = true;
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function saveAuth() {
  authSaving.value = true;
  try {
    await api(`/api/admin/customers/${authCustomer.value.id}/authorizations`, {
      method: "PUT",
      body: { vehicles: authorizedVehicles.value }
    });
    ElMessage.success("车型授权已保存");
    authVisible.value = false;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    authSaving.value = false;
  }
}

async function openPrices(row) {
  priceCustomer.value = row;
  try {
    priceRows.value = await api(`/api/admin/customers/${row.id}/effective-prices`);
    pricesVisible.value = true;
  } catch (error) {
    ElMessage.error(error.message);
  }
}

onMounted(refresh);
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="card-head">
        <el-input v-model="keyword" placeholder="搜索客户名称 / 编码 / 手机号" clearable style="max-width: 320px" />
        <el-button type="primary" @click="openCreate">+ 新建客户</el-button>
      </div>
    </template>
    <el-table :data="filtered" stripe>
      <el-table-column prop="code" label="编码" width="120" />
      <el-table-column prop="name" label="客户名称" min-width="180" />
      <el-table-column label="等级" width="80">
        <template #default="{ row }">{{ row.grade }} / {{ row.priceTier }}</template>
      </el-table-column>
      <el-table-column label="结算" width="110">
        <template #default="{ row }">{{ name(row.settlementMethod) }}</template>
      </el-table-column>
      <el-table-column label="授信额度" width="120" align="right">
        <template #default="{ row }">{{ formatMoney(row.creditLimit) }}</template>
      </el-table-column>
      <el-table-column label="应收" width="120" align="right">
        <template #default="{ row }">{{ formatMoney(row.creditOutstanding) }}</template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="130" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? "启用" : "停用" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="primary" @click="openAuth(row)">车型授权</el-button>
          <el-button link type="primary" @click="openPrices(row)">有效价格</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑客户' : '新建客户'" width="760px">
      <el-form label-width="110px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="客户编码"><el-input v-model="form.code" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="客户名称"><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="省份"><el-input v-model="form.province" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="城市"><el-input v-model="form.city" /></el-form-item></el-col>
          <el-col :span="12">
            <el-form-item label="渠道类型">
              <el-select v-model="form.channelType" style="width: 100%">
                <el-option label="批发商" value="WHOLESALER" />
                <el-option label="4S集团" value="4S_GROUP" />
                <el-option label="连锁" value="CHAIN" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户等级">
              <el-select v-model="form.grade" style="width: 100%">
                <el-option v-for="grade in ['A+', 'A', 'B+', 'B', 'C']" :key="grade" :label="grade" :value="grade" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="价格等级"><el-input v-model="form.priceTier" /></el-form-item></el-col>
          <el-col :span="12">
            <el-form-item label="结算方式">
              <el-select v-model="form.settlementMethod" style="width: 100%">
                <el-option label="账期" value="CREDIT" />
                <el-option label="预付款" value="PREPAY" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="账期天数"><el-input-number v-model="form.paymentTermsDays" :min="0" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="授信额度"><el-input-number v-model="form.creditLimit" :min="0" :precision="2" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="预付款比例"><el-input-number v-model="form.prepayRatio" :min="0.01" :max="1" :step="0.05" :precision="2" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="最多批次"><el-input-number v-model="form.batchLimit" :min="1" :max="20" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="状态"><el-switch v-model="form.active" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="地址"><el-input v-model="form.address" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.notes" type="textarea" :rows="2" /></el-form-item></el-col>
          <el-col :span="24">
            <el-form-item label="允许超发">
              <el-switch v-model="form.allowOverpayment" />
              <span class="muted" style="margin-left: 10px">预付未足额时允许发货</span>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="authVisible" :title="`车型授权 · ${authCustomer?.name || ''}`" width="520px">
      <el-checkbox-group v-model="authorizedVehicles" class="vehicle-grid">
        <el-checkbox v-for="vehicle in allVehicles" :key="vehicle" :value="vehicle" :label="vehicle" />
      </el-checkbox-group>
      <template #footer>
        <el-button @click="authVisible = false">取消</el-button>
        <el-button type="primary" :loading="authSaving" @click="saveAuth">保存授权</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pricesVisible" :title="`有效价格 · ${priceCustomer?.name || ''}`" width="640px">
      <el-table :data="priceRows" size="small">
        <el-table-column prop="sku" label="物料号" width="130" />
        <el-table-column prop="name" label="产品" min-width="160" />
        <el-table-column label="价格" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.price) }}</template>
        </el-table-column>
        <el-table-column label="来源" width="130">
          <template #default="{ row }">{{ row.source === "CUSTOMER_SPECIFIC" ? "客户专属价" : "等级价" }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </el-card>
</template>
