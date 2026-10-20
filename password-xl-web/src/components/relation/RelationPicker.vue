<script setup lang="ts">
import type { RelationDirection } from '@/types'
import type { ScrollbarInstance } from 'element-plus'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import { displaySize, searchFields } from '@/utils/global.ts'
import { makeRelation } from '@/utils/passwordRelations.ts'
import PasswordCard from '@/components/index/PasswordCard.vue'
import { providePasswordCardReveal } from '@/composables/passwordCardReveal.ts'

const props = withDefaults(
  defineProps<{
    currentId: number
    direction: RelationDirection
    draftMode?: boolean
    excludedIds?: number[]
  }>(),
  { draftMode: false, excludedIds: () => [] },
)
const emit = defineEmits<{ close: []; select: [ids: number[]] }>()
const passwordStore = usePasswordStore()
const search = ref('')
const selectedIds = ref<number[]>([])
const page = ref(1)
const pageSizes = [10, 30, 50, 100]
const pageSize = ref(pageSizes[0])
const scrollbar = ref<ScrollbarInstance>()
const busy = ref(false)
const titles = {
  incoming: '添加上游密码',
  undirected: '添加平级关联密码',
  outgoing: '添加下游密码',
}
providePasswordCardReveal()
const excludedIds = computed(() =>
  props.draftMode
    ? new Set(props.excludedIds)
    : new Set(passwordStore.relationIndex.get(props.currentId)?.keys()),
)
const candidates = computed(() =>
  passwordStore.passwordArray.filter(
    (p) => p.id !== props.currentId && !excludedIds.value.has(p.id),
  ),
)
const filtered = computed(() =>
  candidates.value.filter(
    (p) =>
      !search.value.trim() ||
      searchFields(search.value, [p.title, p.username, p.address, p.remark]),
  ),
)
const pagePasswords = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
)
watch([search, pageSize], () => {
  page.value = 1
})
watch(
  [page, pageSize, search],
  () => {
    scrollbar.value?.setScrollTop(0)
  },
  { flush: 'post' },
)
watch(candidates, (items) => {
  const ids = new Set(items.map((p) => p.id))
  selectedIds.value = selectedIds.value.filter((id) => ids.has(id))
  page.value = Math.min(page.value, Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
})
const select = (id: number, selected: boolean) => {
  selectedIds.value = selected
    ? [...new Set([...selectedIds.value, id])]
    : selectedIds.value.filter((value) => value !== id)
}
const save = async () => {
  if (busy.value || !selectedIds.value.length) return
  if (props.draftMode) {
    emit('select', [...selectedIds.value])
    emit('close')
    return
  }
  busy.value = true
  try {
    const result = await passwordStore.passwordManager.addPasswordRelations(
      selectedIds.value.map((id) => makeRelation(props.currentId, id, props.direction)),
    )
    if (result.status) emit('close')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '关联保存失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    :title="titles[direction]"
    width="1060px"
    top="10vh"
    append-to-body
    :fullscreen="['xs', 'sm'].includes(displaySize().value)"
    :close-on-click-modal="false"
    @close="emit('close')"
  >
    <el-input v-model="search" clearable placeholder="搜索密码" aria-label="搜索关联密码" />
    <el-scrollbar ref="scrollbar" max-height="60vh" class="relation-picker-scroll">
      <div class="relation-picker-grid">
        <PasswordCard
          v-for="password in pagePasswords"
          :key="password.id"
          :password="password"
          selection-mode
          :selected="selectedIds.includes(password.id)"
          :show-relation="false"
          :read-only="draftMode"
          @selected-change="select(password.id, $event)"
        />
      </div>
      <el-empty v-if="!filtered.length" description="没有可关联的密码" />
    </el-scrollbar>
    <el-pagination
      v-if="filtered.length > pageSizes[0]"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :page-sizes="pageSizes"
      :pager-count="5"
      :total="filtered.length"
      class="relation-picker-pagination"
      layout="sizes, prev, pager, next"
    />
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :disabled="!selectedIds.length" :loading="busy" @click="save"
        >添加
        {{ selectedIds.length || '' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.relation-picker-scroll {
  margin-top: 12px;
}

.relation-picker-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.relation-picker-pagination {
  margin-top: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 991px) {
  .relation-picker-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .relation-picker-pagination :deep(.el-pagination__sizes) {
    width: 100%;
    margin: 0;
  }
}
</style>
