<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import { useRelationStore } from '@/stores/RelationStore.ts'
import RelationLoading from './RelationLoading.vue'

const PasswordRelations = defineAsyncComponent({
  loader: () => import('./PasswordRelations.vue'),
  loadingComponent: RelationLoading,
  delay: 0,
})
const passwordStore = usePasswordStore()
const relationStore = useRelationStore()
const { width } = useWindowSize()
const current = computed(() =>
  relationStore.dialogPasswordId === null
    ? undefined
    : passwordStore.passwordById.get(relationStore.dialogPasswordId),
)
const opened = ref(false)

watch(
  [() => relationStore.dialogPasswordId, () => passwordStore.relationIndex],
  () => {
    relationStore.retainDialogPasswords()
  },
  { immediate: true },
)

watch(current, (password) => {
  if (!password) {
    opened.value = false
    relationStore.closeGraph()
  }
})
</script>

<template>
  <el-dialog
    :model-value="!!current"
    :title="current ? `${current.title} 关系视图` : ''"
    width="94vw"
    align-center
    :fullscreen="width < 992"
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    class="relation-graph-dialog"
    @opened="opened = true"
    @close="relationStore.closeGraph"
  >
    <PasswordRelations v-if="opened && current" :key="current.id" in-dialog />
    <RelationLoading v-else />
  </el-dialog>
</template>

<style>
.relation-graph-dialog {
  height: 92vh;
  display: flex;
  flex-direction: column;
}
.relation-graph-dialog.is-fullscreen {
  height: 100%;
}
.relation-graph-dialog .el-dialog__header {
  flex-shrink: 0;
}
.relation-graph-dialog .el-dialog__title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.relation-graph-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
</style>
