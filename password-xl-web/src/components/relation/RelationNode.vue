<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { Connection } from '@vue-flow/core'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import PasswordCard from '@/components/index/PasswordCard.vue'

const props = withDefaults(
  defineProps<{
    id: string
    isValidConnection: (connection: Connection) => boolean
    selectionEnabled?: boolean
  }>(),
  { selectionEnabled: true },
)
const passwordStore = usePasswordStore()
const password = computed(() => passwordStore.passwordById.get(Number(props.id)))
const selected = computed(() => passwordStore.batchSelectedPasswordIdSet.has(Number(props.id)))
const handles = [Position.Top, Position.Right, Position.Bottom, Position.Left]
</script>

<template>
  <div v-if="password" class="relation-node">
    <PasswordCard
      :password="password"
      :selection-mode="selectionEnabled && passwordStore.batchOperationEnabled"
      :selected="selected"
      @selected-change="passwordStore.toggleBatchPasswordSelection(password.id, $event)"
    />
    <Handle
      v-for="position in handles"
      :id="position"
      :key="position"
      type="source"
      :position="position"
      :is-valid-connection="isValidConnection"
    />
  </div>
</template>

<style scoped>
.relation-node {
  width: 440px;
}
.relation-node :deep(.password-header-div) {
  cursor: grab;
  user-select: none;
}
.relation-node :deep(.password-header-div:active) {
  cursor: grabbing;
}
.relation-node :deep(.password-card) {
  margin: 0;
  height: auto;
  background-color: var(--el-bg-color) !important;
}
.relation-node :deep(.vue-flow__handle) {
  width: 9px;
  height: 9px;
  background: var(--el-color-primary);
  border: 2px solid var(--el-bg-color);
  opacity: 0;
  transition: opacity 0.15s;
}
.relation-node:hover :deep(.vue-flow__handle) {
  opacity: 1;
}
</style>
