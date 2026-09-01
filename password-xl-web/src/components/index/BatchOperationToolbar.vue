<script lang="ts" setup>
import {PasswordDisplayMode} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import BatchAddLabelDialog from "@/components/index/BatchAddLabelDialog.vue";

const passwordStore = usePasswordStore()
const settingStore = useSettingStore()
const deleteLoading = ref(false)
const labelDialogVisible = ref(false)

const hasSelectedPassword = computed(() => passwordStore.batchSelectedPasswordCount > 0)
const allVisiblePasswordsSelected = computed(() =>
    passwordStore.visPasswordArray.length > 0
    && passwordStore.batchSelectedPasswordCount === passwordStore.visPasswordArray.length
)

const deleteSelectedPasswords = async () => {
  const selectedCount = passwordStore.batchSelectedPasswordCount
  if (!selectedCount || deleteLoading.value) {
    return
  }

  const recycleBinEnabled = settingStore.setting.enableRecycleBin
  const message = recycleBinEnabled
      ? `确认删除已选中的 ${selectedCount} 个密码吗？删除后将移入回收站。`
      : `确认永久删除已选中的 ${selectedCount} 个密码吗？此操作无法撤销。`

  try {
    await ElMessageBox.confirm(message, '批量删除密码', {
      confirmButtonClass: 'confirm-delete-btn',
      confirmButtonText: recycleBinEnabled ? '删除' : '永久删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  deleteLoading.value = true
  try {
    const resp = await passwordStore.passwordManager.batchDeletePasswords([...passwordStore.batchSelectedPasswordIds])
    if (!resp.status) {
      throw new Error(resp.message || '批量删除密码失败')
    }
    ElMessage.success(recycleBinEnabled ? '所选密码已移入回收站' : '所选密码已永久删除')
    passwordStore.exitBatchOperation()
  } catch (error: any) {
    ElNotification.error({
      title: '批量删除密码失败',
      message: error?.message || String(error || '请稍后重试'),
    })
  } finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <el-space :size="6" alignment="center" class="batch-operation-toolbar">
    <el-text class="batch-selected-count">已选 {{ passwordStore.batchSelectedPasswordCount }} 项</el-text>
    <template v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.CARD">
      <el-button
          :disabled="deleteLoading || allVisiblePasswordsSelected"
          plain
          size="small"
          @click="passwordStore.selectAllVisiblePasswords"
      >
        全选
      </el-button>
      <el-button
          :disabled="deleteLoading || !hasSelectedPassword"
          plain
          size="small"
          @click="passwordStore.clearBatchPasswordSelection"
      >
        取消全选
      </el-button>
    </template>
    <el-button
        :disabled="!hasSelectedPassword"
        :loading="deleteLoading"
        plain
        size="small"
        type="danger"
        @click="deleteSelectedPasswords"
    >
      删除
    </el-button>
    <el-button
        :disabled="!hasSelectedPassword || deleteLoading"
        plain
        size="small"
        type="primary"
        @click="labelDialogVisible = true"
    >
      添加标签
    </el-button>
    <el-button
        :disabled="deleteLoading"
        plain
        size="small"
        @click="passwordStore.exitBatchOperation"
    >
      退出
    </el-button>
  </el-space>

  <BatchAddLabelDialog v-model="labelDialogVisible"/>
</template>

<style scoped>
.batch-operation-toolbar {
  box-sizing: border-box;
  height: 32px;
  min-height: 32px;
  padding: 0 5px 0 9px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background-color: var(--el-fill-color-blank);
  white-space: nowrap;
}

.batch-operation-toolbar :deep(.el-space__item) {
  display: flex;
  align-items: center;
}

.batch-selected-count {
  min-width: 62px;
  text-align: center;
}

@media only screen and (max-width: 991px) {
  .batch-operation-toolbar {
    width: 100%;
    flex-wrap: nowrap !important;
    overflow-x: auto;
  }
}
</style>
