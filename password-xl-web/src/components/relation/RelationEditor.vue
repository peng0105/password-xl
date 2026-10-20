<script setup lang="ts">
import type { RelationDirection } from '@/types'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import { makeRelation, relationDirection } from '@/utils/passwordRelations.ts'

const props = defineProps<{ currentId: number; otherId: number; showTitles?: boolean }>()
const emit = defineEmits<{ done: [] }>()
const passwordStore = usePasswordStore()
const busy = ref(false)
const relation = computed(() =>
  passwordStore.relationIndex.get(props.currentId)?.get(props.otherId),
)
const direction = computed(() =>
  relation.value ? relationDirection(relation.value, props.currentId) : null,
)
const options: { value: RelationDirection; label: string }[] = [
  { value: 'incoming', label: '指向当前' },
  { value: 'undirected', label: '无方向' },
  { value: 'outgoing', label: '当前指向' },
]
const optionLabel = (option: (typeof options)[number]) => {
  if (!props.showTitles || option.value === 'undirected') return option.label
  const current = passwordStore.passwordArray.find((p) => p.id === props.currentId)?.title || ''
  const other = passwordStore.passwordArray.find((p) => p.id === props.otherId)?.title || ''
  return option.value === 'incoming' ? `${other} → ${current}` : `${current} → ${other}`
}

const change = async (value: RelationDirection | 'remove') => {
  if (busy.value) return
  busy.value = true
  try {
    const manager = passwordStore.passwordManager
    const result =
      value === 'remove'
        ? await manager.removePasswordRelation(props.currentId, props.otherId)
        : await manager.updatePasswordRelation(makeRelation(props.currentId, props.otherId, value))
    if (result.status) emit('done')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '关联保存失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="relation-editor">
    <el-button
      v-for="option in options"
      :key="option.value"
      text
      :type="direction === option.value ? 'primary' : 'default'"
      :disabled="busy || direction === option.value"
      :title="optionLabel(option)"
      @click="change(option.value)"
    >
      <span>{{ optionLabel(option) }}</span>
    </el-button>
    <el-divider />
    <el-button text type="danger" :disabled="busy" @click="change('remove')">解除关联</el-button>
  </div>
</template>

<style scoped>
.relation-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.relation-editor .el-button {
  margin: 0;
  justify-content: flex-start;
}
.relation-editor .el-button span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.relation-editor .el-divider {
  margin: 4px 0;
}
</style>
