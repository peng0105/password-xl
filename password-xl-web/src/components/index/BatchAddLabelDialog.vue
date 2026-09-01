<script lang="ts" setup>
import {displaySize} from "@/utils/global.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const passwordStore = usePasswordStore()
const labelTreeRef = ref()
const selectedLabelIds = ref<number[]>([])
const saving = ref(false)

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const defaultExpandedKeys = computed(() => passwordStore.labelArray.map(label => label.id))

const resetSelectedLabels = () => {
  selectedLabelIds.value = []
  nextTick(() => labelTreeRef.value?.setCheckedKeys([]))
}

const updateSelectedLabels = () => {
  selectedLabelIds.value = (labelTreeRef.value?.getCheckedKeys(false) || []) as number[]
}

const confirmAddLabels = async () => {
  if (!passwordStore.batchSelectedPasswordCount || !selectedLabelIds.value.length || saving.value) {
    return
  }

  saving.value = true
  try {
    const resp = await passwordStore.passwordManager.batchAddPasswordLabels(
        [...passwordStore.batchSelectedPasswordIds],
        [...selectedLabelIds.value],
    )
    if (!resp.status) {
      throw new Error(resp.message || '批量添加标签失败')
    }
    ElMessage.success(resp.message || '标签添加成功')
    dialogVisible.value = false
    passwordStore.exitBatchOperation()
  } catch (error: any) {
    ElNotification.error({
      title: '批量添加标签失败',
      message: error?.message || String(error || '请稍后重试'),
    })
  } finally {
    saving.value = false
  }
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    resetSelectedLabels()
  }
})
</script>

<template>
  <el-dialog
      v-model="dialogVisible"
      :close-on-click-modal="!saving"
      :close-on-press-escape="!saving"
      :show-close="!saving"
      :width="['xs','sm'].includes(displaySize().value) ? '92%' : '460px'"
      append-to-body
      title="批量添加标签"
      @closed="resetSelectedLabels"
  >
    <el-scrollbar v-if="passwordStore.labelArray.length" max-height="420px">
      <el-tree
          ref="labelTreeRef"
          :check-strictly="true"
          :data="passwordStore.labelArray"
          :default-expanded-keys="defaultExpandedKeys"
          :expand-on-click-node="false"
          :props="{label: 'name'}"
          node-key="id"
          show-checkbox
          @check-change="updateSelectedLabels"
      />
    </el-scrollbar>
    <el-empty v-else :image-size="70" description="暂无标签"/>

    <template #footer>
      <el-button :disabled="saving" @click="dialogVisible = false">取消</el-button>
      <el-button
          :disabled="!passwordStore.batchSelectedPasswordCount || !selectedLabelIds.length"
          :loading="saving"
          type="primary"
          @click="confirmAddLabels"
      >
        确认添加
      </el-button>
    </template>
  </el-dialog>
</template>

