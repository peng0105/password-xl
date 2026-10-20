<script setup lang="ts">
import { ArrowLeft, Close, Connection, Plus } from '@element-plus/icons-vue'
import type { ScrollbarInstance } from 'element-plus'
import { useWindowSize } from '@vueuse/core'
import { VueDraggable } from 'vue-draggable-plus'
import type { DraggableEvent } from 'vue-draggable-plus'
import type { DraftPasswordRelation, Password, RelationDirection } from '@/types'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import { useRelationStore } from '@/stores/RelationStore.ts'
import {
  directionalPasswordIds,
  makeRelation,
  relationDirection,
} from '@/utils/passwordRelations.ts'
import { providePasswordCardReveal } from '@/composables/passwordCardReveal.ts'
import PasswordCard from '@/components/index/PasswordCard.vue'
import RelationPicker from './RelationPicker.vue'

const props = withDefaults(
  defineProps<{
    draft?: Password
    draftRelations?: DraftPasswordRelation[]
  }>(),
  { draftRelations: () => [] },
)
const emit = defineEmits<{
  'update:draftRelations': [relations: DraftPasswordRelation[]]
  close: []
}>()
const passwordStore = usePasswordStore()
const relationStore = useRelationStore()
const { width } = useWindowSize()
const scrollbar = ref<ScrollbarInstance>()
const picker = ref<RelationDirection | null>(null)
const dragging = ref(false)
const savingDirection = ref(false)
const draftExpandedDirections = reactive({ incoming: false, outgoing: false })
const expandedDirections = computed(() =>
  props.draft
    ? draftExpandedDirections
    : relationStore.navigation.at(-1)?.expandedDirections || { incoming: false, outgoing: false },
)
const { showPasswordId } = providePasswordCardReveal()
// -1 只用于草稿卡片的显隐状态，不能进入密码列表、导航或正式关系数据。
const current = computed(() =>
  props.draft
    ? { ...props.draft, id: -1, title: props.draft.title || '新密码' }
    : passwordStore.passwordById.get(relationStore.currentId ?? 0),
)
const draftIndex = computed(
  () => new Map(props.draftRelations.map((relation) => [relation.passwordId, relation.direction])),
)
const directRelations = computed(() =>
  props.draft
    ? new Map(
        props.draftRelations
          .filter((relation) => passwordStore.passwordById.has(relation.passwordId))
          .map((relation) => [
            relation.passwordId,
            makeRelation(-1, relation.passwordId, relation.direction),
          ]),
      )
    : passwordStore.relationIndex.get(current.value?.id ?? 0),
)
const groups = computed(() => {
  const id = current.value?.id
  if (id === undefined) return []
  return (['incoming', 'undirected', 'outgoing'] as const).map((direction) => {
    const directIds = new Set(
      [...(directRelations.value || [])]
        .filter(([, relation]) => relationDirection(relation, id) === direction)
        .map(([otherId]) => otherId),
    )
    const ids =
      direction !== 'undirected' && expandedDirections.value[direction]
        ? directionalPasswordIds(
            id,
            passwordStore.relationIndex,
            direction,
            true,
            directRelations.value,
          )
        : directIds
    const passwords = passwordStore.passwordArray.filter((password) => ids.has(password.id))
    if (direction === 'undirected' && current.value) passwords.unshift(current.value)
    return {
      direction,
      title: { incoming: '上游密码', undirected: '平级关联密码', outgoing: '下游密码' }[direction],
      passwords,
      directIds,
    }
  })
})
const total = computed(() =>
  groups.value.reduce((count, group) => count + group.passwords.length, 0),
)
const columns = computed(() => (width.value >= 992 && total.value >= 4 ? 2 : 1))
const drawerSize = computed(() =>
  width.value < 992 ? '100%' : `${Math.min(columns.value === 2 ? 1060 : 540, width.value - 32)}px`,
)

watch(
  () => passwordStore.passwordArray.map((p) => p.id),
  (ids) => {
    if (props.draft) return
    const activeIds = new Set(ids)
    while (relationStore.currentId !== null && !activeIds.has(relationStore.currentId))
      relationStore.back()
  },
)
watch(
  () => current.value?.id,
  async () => {
    picker.value = null
    dragging.value = false
    showPasswordId.value = 0
    await nextTick()
    restoreScroll()
  },
)
const restoreScroll = () =>
  scrollbar.value?.setScrollTop(props.draft ? 0 : relationStore.navigation.at(-1)?.scrollTop || 0)
const saveScroll = ({ scrollTop }: { scrollTop: number }) => {
  if (props.draft) return
  const entry = relationStore.navigation.at(-1)
  if (entry) entry.scrollTop = scrollTop
}
const close = () => {
  if (props.draft) emit('close')
  else relationStore.closeDrawer()
}
const addDraftRelations = (ids: number[]) => {
  if (!props.draft || !picker.value) return
  const additions = ids
    .filter((id) => passwordStore.passwordById.has(id) && !draftIndex.value.has(id))
    .map((passwordId) => ({ passwordId, direction: picker.value! }))
  emit('update:draftRelations', [...props.draftRelations, ...additions])
}
const unlinkDraftRelation = (id: number) => {
  emit(
    'update:draftRelations',
    props.draftRelations.filter((relation) => relation.passwordId !== id),
  )
}

// 分组内容始终来自关系数据；拖放只改变方向，不保存卡片的临时排序。
const moveRelation = async (event: DraggableEvent<Password>) => {
  dragging.value = false
  const currentId = current.value?.id
  const otherId = event.data?.id
  const direction = event.to.dataset.direction
  if (
    savingDirection.value ||
    currentId === undefined ||
    otherId === undefined ||
    currentId === otherId ||
    event.from === event.to ||
    (direction !== 'incoming' && direction !== 'undirected' && direction !== 'outgoing')
  )
    return
  const relation = directRelations.value?.get(otherId)
  if (!relation || relationDirection(relation, currentId) !== event.from.dataset.direction) return
  if (props.draft) {
    emit(
      'update:draftRelations',
      props.draftRelations.map((relation) =>
        relation.passwordId === otherId ? { ...relation, direction } : relation,
      ),
    )
    return
  }
  if (relationDirection(relation, currentId) === direction) return
  savingDirection.value = true
  try {
    await passwordStore.passwordManager.updatePasswordRelation(
      makeRelation(currentId, otherId, direction),
    )
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '关联保存失败')
  } finally {
    savingDirection.value = false
  }
}
</script>

<template>
  <el-drawer
    :model-value="!!current"
    :size="drawerSize"
    direction="rtl"
    append-to-body
    :show-close="false"
    class="password-relation-drawer"
    destroy-on-close
    @close="close"
    @opened="restoreScroll"
  >
    <template #header>
      <div v-if="current" class="relation-drawer-header">
        <el-button
          v-if="!draft && relationStore.canGoBack"
          :icon="ArrowLeft"
          text
          circle
          aria-label="返回"
          @click="relationStore.back"
        />
        <el-text class="relation-drawer-title" truncated>{{ current.title }}</el-text>
        <el-tooltip v-if="!draft" content="关系视图" placement="bottom">
          <el-button
            :icon="Connection"
            text
            circle
            aria-label="关系视图"
            @click="relationStore.openGraph(current.id)"
          />
        </el-tooltip>
        <el-button :icon="Close" text circle aria-label="关闭关联" @click="close" />
      </div>
    </template>
    <el-scrollbar v-if="current" ref="scrollbar" height="100%" @scroll="saveScroll">
      <section
        v-for="group in groups"
        :key="group.direction"
        :aria-label="group.title"
        class="relation-section"
        :class="{ 'is-dragging': dragging }"
      >
        <div class="relation-section-header">
          <div class="relation-section-title">
            <el-text>{{ group.title }}</el-text>
            <el-text v-if="group.direction !== 'undirected'" class="relation-traversal-toggle">
              （显示全部{{ group.direction === 'incoming' ? '上游' : '下游' }}
              <el-switch
                v-model="expandedDirections[group.direction]"
                size="small"
                :aria-label="group.direction === 'incoming' ? '显示全部上游' : '显示全部下游'"
                :disabled="dragging || savingDirection"
              />）
            </el-text>
          </div>
          <el-button
            :icon="Plus"
            plain
            size="small"
            :aria-label="`添加${group.title}`"
            @click="picker = group.direction"
            >添加</el-button
          >
        </div>
        <VueDraggable
          :model-value="group.passwords"
          :group="`password-relations-${current.id}`"
          :sort="false"
          :disabled="savingDirection"
          :animation="180"
          :force-fallback="true"
          :fallback-on-body="true"
          :fallback-tolerance="4"
          :delay="160"
          :delay-on-touch-only="true"
          :touch-start-threshold="5"
          :scroll="true"
          :bubble-scroll="true"
          :scroll-sensitivity="56"
          :scroll-speed="12"
          handle=".password-header-div"
          draggable=".relation-card-wrapper.is-direct"
          filter=".card-opt-icon, .batch-card-checkbox"
          :prevent-on-filter="false"
          ghost-class="relation-card-ghost"
          fallback-class="relation-card-drag-preview"
          class="relation-card-grid"
          :data-direction="group.direction"
          :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
          @start="dragging = true"
          @end="moveRelation"
        >
          <div
            v-for="password in group.passwords"
            :key="`${current.id}:${password.id}`"
            :class="[
              password.id === current.id ? 'relation-current-card' : 'relation-card-wrapper',
              { 'is-direct': group.directIds.has(password.id) },
            ]"
          >
            <PasswordCard
              :password="password"
              :relation-context-id="
                !draft && group.directIds.has(password.id) ? current.id : undefined
              "
              :read-only="!!draft"
              :unlink-handler="
                draft && group.directIds.has(password.id)
                  ? () => unlinkDraftRelation(password.id)
                  : undefined
              "
            />
          </div>
        </VueDraggable>
      </section>
    </el-scrollbar>
  </el-drawer>
  <RelationPicker
    v-if="picker && current"
    :key="`${current.id}:${picker}`"
    :current-id="current.id"
    :direction="picker"
    :draft-mode="!!draft"
    :excluded-ids="draftRelations.map((relation) => relation.passwordId)"
    @select="addDraftRelations"
    @close="picker = null"
  />
</template>

<style scoped>
.relation-drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.relation-drawer-header .el-button {
  width: 24px;
  height: 24px;
  margin: 0;
  padding: 2px;
  font-size: 20px;
}
.relation-drawer-title {
  flex: 1;
  font-size: 16px;
  line-height: 24px;
}
.relation-section {
  padding: 0 8px 16px;
}
.relation-section + .relation-section {
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.relation-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 6px 8px;
}
.relation-section-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}
.relation-traversal-toggle {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.relation-traversal-toggle .el-switch {
  margin-left: 4px;
  flex-shrink: 0;
}
.relation-card-grid {
  display: grid;
  align-items: stretch;
  min-height: 56px;
  border-radius: var(--el-border-radius-base);
}
.relation-card-wrapper {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.relation-card-wrapper.is-direct :deep(.password-header-div) {
  cursor: grab;
}
.relation-card-wrapper.is-direct :deep(.password-header-div:active) {
  cursor: grabbing;
}
.relation-current-card {
  min-width: 0;
}
.relation-current-card :deep(.password-card) {
  border-color: var(--el-color-primary-light-5);
}
.is-dragging .relation-card-grid {
  outline: 1px dashed var(--el-border-color);
}
.relation-card-grid:has(.relation-card-ghost) {
  background: var(--el-color-primary-light-9);
  outline-color: var(--el-color-primary);
}
.relation-card-ghost {
  opacity: 0.35;
}
</style>

<style>
.password-relation-drawer .el-drawer__header {
  margin-bottom: 0;
}
.password-relation-drawer .el-drawer__body {
  padding: 20px 8px 0;
  overflow: hidden;
}
.relation-card-drag-preview {
  opacity: 0.85;
}
</style>
