<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { useAuthStore } from "../stores/auth.js";
import { formatDate, name, tagType } from "../utils/format.js";

const auth = useAuthStore();
const loading = ref(true);
const plans = ref([]);
const statusFilter = ref("");
const detailVisible = ref(false);
const detail = ref(null);
const actionVisible = ref(false);
const action = reactive({ planId: "", type: "", note: "" });
const acting = ref(false);

const statuses = [
  ["BANGBANG_REVIEW", "邦邦审核"],
  ["SANLEI_REVIEW", "三磊审核"],
  ["APPROVED", "已审核"],
  ["REJECTED", "已退回"],
  ["DRAFT", "草稿"]
];

const filtered = computed(() =>
  statusFilter.value ? plans.value.filter((plan) => plan.status === statusFilter.value) : plans.value
);

async function refresh() {
  loading.value = true;
  try {
    plans.value = await api("/api/admin/plans");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openDetail(plan) {
  detail.value = plan;
  detailVisible.value = true;
}

function openAction(plan, type) {
  action.planId = plan.id;
  action.type = type;
  action.note = "";
  actionVisible.value = true;
}

async function submitAction() {
  acting.value = true;
  try {
    await api(`/api/admin/plans/${action.planId}/actions`, {
      method: "POST",
      body: { action: action.type, note: action.note }
    });
    ElMessage.success("计划状态已更新");
    actionVisible.value = false;
    await refresh();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    acting.value = false;
  }
}

function canBangbang(plan) {
  return plan.status === "BANGBANG_REVIEW" && ["SUPER_ADMIN", "BANGBANG_OPS"].includes(auth.user?.role);
}

function canSanlei(plan) {
  return plan.status === "SANLEI_REVIEW" && ["SUPER_ADMIN", "SANLEI_SALES"].includes(auth.user?.role);
}

function actionLabel(type) {
  return {
    BANGBANG_APPROVE: "邦邦通过",
    BANGBANG_REJECT: "邦邦退回",
    SANLEI_APPROVE: "三磊生效",
    SANLEI_REJECT: "三磊退回"
  }[type] || type;
}

onMounted(refresh);
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="card-head">
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 180px">
          <el-option v-for="[value, label] in statuses" :key="value" :label="label" :value="value" />
        </el-select>
        <span class="muted">月度滚动计划 · 邦邦与三磊接力审核</span>
      </div>
    </template>
    <el-table :data="filtered" stripe>
      <el-table-column prop="planNo" label="计划单号" min-width="190" />
      <el-table-column prop="customerName" label="客户" min-width="180" />
      <el-table-column prop="grade" label="等级" width="80" />
      <el-table-column prop="planMonth" label="月份" width="100" />
      <el-table-column prop="itemCount" label="产品数" width="80" align="right" />
      <el-table-column prop="totalQuantity" label="计划数量" width="100" align="right" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="tagType(row.status)" size="small">{{ name(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交时间" width="150">
        <template #default="{ row }">{{ formatDate(row.submittedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <template v-if="canBangbang(row)">
            <el-button link type="success" @click="openAction(row, 'BANGBANG_APPROVE')">通过</el-button>
            <el-button link type="danger" @click="openAction(row, 'BANGBANG_REJECT')">退回</el-button>
          </template>
          <template v-else-if="canSanlei(row)">
            <el-button link type="success" @click="openAction(row, 'SANLEI_APPROVE')">生效</el-button>
            <el-button link type="danger" @click="openAction(row, 'SANLEI_REJECT')">退回</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="detailVisible" :title="detail ? `采购计划 ${detail.planNo}` : '采购计划'" width="720px">
    <template v-if="detail">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="客户">{{ detail.customerName }}（{{ detail.grade }} 级）</el-descriptions-item>
        <el-descriptions-item label="计划月份">{{ detail.planMonth }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="tagType(detail.status)" size="small">{{ name(detail.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="计划数量">{{ detail.totalQuantity }}</el-descriptions-item>
        <el-descriptions-item label="客户备注" :span="2">{{ detail.customerNote || "—" }}</el-descriptions-item>
        <el-descriptions-item label="邦邦意见" :span="2">{{ detail.bangbangNote || "—" }}</el-descriptions-item>
        <el-descriptions-item label="三磊意见" :span="2">{{ detail.sanleiNote || "—" }}</el-descriptions-item>
      </el-descriptions>
      <el-table :data="detail.items" size="small" style="margin-top: 14px">
        <el-table-column label="周次" width="70">
          <template #default="{ row }">第{{ row.weekNo }}周</template>
        </el-table-column>
        <el-table-column prop="sku" label="物料号" width="130" />
        <el-table-column prop="name" label="产品" min-width="150" />
        <el-table-column prop="quantity" label="计划数" width="80" align="right" />
        <el-table-column prop="orderedQuantity" label="已下单" width="80" align="right" />
      </el-table>
    </template>
  </el-dialog>

  <el-dialog v-model="actionVisible" :title="actionLabel(action.type)" width="480px">
    <el-form label-width="90px">
      <el-form-item :label="action.type.endsWith('REJECT') ? '退回原因' : '审核意见'">
        <el-input v-model="action.note" type="textarea" :rows="3" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="actionVisible = false">取消</el-button>
      <el-button type="primary" :loading="acting" @click="submitAction">确认</el-button>
    </template>
  </el-dialog>
</template>
