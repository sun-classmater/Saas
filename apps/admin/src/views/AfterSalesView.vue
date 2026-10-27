<script setup>
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api/client.js";
import { useAuthStore } from "../stores/auth.js";
import { formatDate, formatMoney, name, tagType } from "../utils/format.js";

const auth = useAuthStore();
const loading = ref(true);
const cases = ref([]);
const dialogVisible = ref(false);
const current = ref(null);
const form = reactive({ status: "REVIEWING", resolution: "" });
const saving = ref(false);

const canProcess = ["SUPER_ADMIN", "SANLEI_AFTERSALES"].includes(auth.user?.role);

async function refresh() {
  loading.value = true;
  try {
    cases.value = await api("/api/admin/after-sales");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openProcess(row) {
  current.value = row;
  form.status = row.status === "OPEN" ? "REVIEWING" : "CLOSED";
  form.resolution = row.resolution || "";
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    await api(`/api/admin/after-sales/${current.value.id}`, {
      method: "PUT",
      body: { status: form.status, resolution: form.resolution }
    });
    ElMessage.success("售后状态已更新");
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
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="card-head">
        <span>售后服务</span>
        <span class="muted">退货 / 索赔 / 发错货 / 更换 / 市场质量反馈</span>
      </div>
    </template>
    <el-table :data="cases" stripe>
      <el-table-column prop="caseNo" label="售后单号" width="170" />
      <el-table-column label="客户 / 订单" min-width="200">
        <template #default="{ row }">
          {{ row.customerName }}
          <div class="muted">{{ row.orderNo || "无关联订单" }}</div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="100">
        <template #default="{ row }">{{ name(row.type) }}</template>
      </el-table-column>
      <el-table-column prop="description" label="问题描述" min-width="200" show-overflow-tooltip />
      <el-table-column label="索赔金额" width="110" align="right">
        <template #default="{ row }">{{ formatMoney(row.claimAmount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="tagType(row.status)" size="small">{{ name(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="150">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-button
            v-if="canProcess && ['OPEN', 'REVIEWING'].includes(row.status)"
            link
            type="primary"
            @click="openProcess(row)"
          >
            处理
          </el-button>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="dialogVisible" :title="`处理售后 ${current?.caseNo || ''}`" width="460px">
    <el-form label-width="90px">
      <el-form-item label="状态">
        <el-select v-model="form.status" style="width: 100%">
          <el-option label="处理中" value="REVIEWING" />
          <el-option label="已通过" value="APPROVED" />
          <el-option label="已拒绝" value="REJECTED" />
          <el-option label="已关闭" value="CLOSED" />
        </el-select>
      </el-form-item>
      <el-form-item label="处理说明">
        <el-input v-model="form.resolution" type="textarea" :rows="3" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
