<script setup lang="ts">
import {
  ConnectionMode,
  MarkerType,
  Position,
  VueFlow,
  pointToRendererPoint,
  useVueFlow,
} from '@vue-flow/core'
import type { Connection, Edge, EdgeMouseEvent, Node } from '@vue-flow/core'
import { FullScreen, Minus, Plus, Refresh, Close } from '@element-plus/icons-vue'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import { useRelationStore } from '@/stores/RelationStore.ts'
import { useRefStore } from '@/stores/RefStore.ts'
import { relationKey } from '@/utils/passwordRelations.ts'
import { layoutRelationNodes } from '@/utils/relationLayout.ts'
import { relationEdgeOffsets } from '@/utils/relationEdgeRouting.ts'
import { providePasswordCardReveal } from '@/composables/passwordCardReveal.ts'
import { waitForPaint } from '@/utils/loading.ts'
import RelationNode from './RelationNode.vue'
import RelationEdge from './RelationEdge.vue'
import RelationEditor from './RelationEditor.vue'
import '@vue-flow/core/dist/style.css'

const props = withDefaults(defineProps<{ inDialog?: boolean }>(), { inDialog: false })
const passwordStore = usePasswordStore()
const relationStore = useRelationStore()
const refStore = useRefStore()
const container = ref<HTMLElement>()
const nodes = shallowRef<Node[]>([])
const editor = ref<{ sourceId: number; targetId: number; x: number; y: number } | null>(null)
const connecting = ref(false)
const renderVisibleOnly = ref(false)
const graphMounted = ref(false)
const initialLoading = ref(true)
const layoutLoading = ref(false)
const loading = computed(
  () => nodes.value.length > 0 && (initialLoading.value || layoutLoading.value),
)
let disposed = false
// 先让遮罩完成一帧绘制，再挂载大量卡片或执行重新布局。
onMounted(async () => {
  await waitForPaint()
  if (!disposed) graphMounted.value = true
})
onBeforeUnmount(() => {
  disposed = true
})
// 对话框和主页可同时显示画布，各自维护视角、布局和定位状态。
const graphId = `password-relations-${useId()}`
const {
  nodes: graphNodes,
  viewport,
  setViewport,
  setEdges,
  fitView,
  zoomIn,
  zoomOut,
  onNodesInitialized,
  onNodeDragStop,
} = useVueFlow(graphId)
providePasswordCardReveal()
const positions = computed(() =>
  props.inDialog ? relationStore.dialogPositions : relationStore.positions,
)
const focusId = computed(() =>
  props.inDialog ? relationStore.dialogFocusId : relationStore.focusId,
)
const passwords = computed(() =>
  props.inDialog
    ? passwordStore.passwordArray.filter((password) =>
        relationStore.dialogPasswordIds?.has(password.id),
      )
    : passwordStore.visPasswordArray,
)
const visibleIds = computed(() => new Set(passwords.value.map((p) => p.id)))
const visibleRelations = computed(() =>
  passwordStore.relations.filter(
    (r) => visibleIds.value.has(r.sourceId) && visibleIds.value.has(r.targetId),
  ),
)

const showContextmenu = (event: MouseEvent) => {
  const bounds = container.value?.getBoundingClientRect()
  if (!bounds || props.inDialog) return
  editor.value = null
  refStore.contextmenuRef?.showContextmenu(event, {
    position: pointToRendererPoint(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      viewport.value,
    ),
    viewport: { ...viewport.value },
  })
}

// 布局与连线读取完整节点集合；视口外的卡片可以卸载，但仍保留位置和尺寸。
const nodeIndex = computed(() => new Map(graphNodes.value.map((node) => [node.id, node])))
const edges = computed<Edge[]>(() => {
  const routes = visibleRelations.value
    .filter(
      (relation) =>
        nodeIndex.value.has(String(relation.sourceId)) &&
        nodeIndex.value.has(String(relation.targetId)),
    )
    .map((relation) => {
      const source = nodeIndex.value.get(String(relation.sourceId))!
      const target = nodeIndex.value.get(String(relation.targetId))!
      const dx = target.position.x - source.position.x
      const dy = target.position.y - source.position.y
      const horizontal = relation.directed ? Math.abs(dy) < 1 : Math.abs(dx) > Math.abs(dy)
      return {
        id: relationKey(relation.sourceId, relation.targetId),
        source: String(relation.sourceId),
        target: String(relation.targetId),
        sourceHandle: horizontal
          ? dx >= 0
            ? Position.Right
            : Position.Left
          : dy >= 0
            ? Position.Bottom
            : Position.Top,
        targetHandle: horizontal
          ? dx >= 0
            ? Position.Left
            : Position.Right
          : dy >= 0
            ? Position.Top
            : Position.Bottom,
        type: 'relation',
        markerEnd: relation.directed
          ? {
              type: MarkerType.Arrow,
              color: 'var(--el-color-primary)',
              width: 22,
              height: 22,
              markerUnits: 'userSpaceOnUse',
              strokeWidth: 1.5,
            }
          : undefined,
        style: {
          stroke: 'var(--el-color-primary)',
          strokeWidth: 1.8,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
        },
        interactionWidth: 24,
        deletable: false,
        ariaLabel: `${passwordStore.passwordById.get(relation.sourceId)?.title} ${relation.directed ? '指向' : '关联'} ${passwordStore.passwordById.get(relation.targetId)?.title}`,
      }
    })
  const offsets = relationEdgeOffsets(routes, nodeIndex.value)
  return routes.map((route) => ({ ...route, data: offsets.get(route.id)! }))
})

// 节点先同步到图中，再更新连线，避免筛选切换时端点尚未挂载。
watch(edges, (value) => setEdges(value), { flush: 'post' })

let nodesVersion = 0
watch(
  () => passwords.value.map((p) => p.id).join(','),
  () => {
    nodesVersion++
    editor.value = null
    setEdges([])
    const previous = new Map(nodes.value.map((n) => [n.id, n]))
    nodes.value = passwords.value.map(
      (password, index) =>
        previous.get(String(password.id)) || {
          id: String(password.id),
          type: 'password',
          position: positions.value[password.id] || {
            x: (index % 3) * 520,
            y: Math.floor(index / 3) * 500,
          },
          dragHandle: '.password-header-div',
          deletable: false,
          selectable: false,
        },
    )
  },
  { immediate: true },
)

let fitting = false
let focusing = false
let viewportInitialized = false
const focusSavedPassword = async () => {
  const id = focusId.value
  if (focusing) return true
  if (id === null || fitting) return false
  const node = nodeIndex.value.get(String(id))
  if (!node?.dimensions.height || !positions.value[id]) return false
  const placement = props.inDialog ? null : relationStore.focusPlacement
  focusing = true
  try {
    if (placement) {
      // 保存期间节点可能已被自动排布；确认成功后以右键落点覆盖，并恢复当时的视角。
      renderVisibleOnly.value = false
    }
    // 右键落点可能与已有节点重叠，保存后定位的卡片需置顶，保证内部按钮可操作。
    nodes.value = nodes.value.map((item) => ({
      ...item,
      zIndex: item.id === String(id) ? 1 : 0,
      ...(placement && item.id === String(id) ? { position: { ...placement.position } } : {}),
    }))
    await nextTick()
    if (disposed || focusId.value !== id) return false
    const { width, height } = node.dimensions
    const focused = placement
      ? await setViewport(placement.viewport)
      : await fitView({ nodes: [String(id)], padding: 0.35, maxZoom: 1, duration: 250 })
    // 编辑内容可能改变高度；待卡片实际尺寸更新后校准中心。
    if (
      !placement &&
      focused &&
      (node.dimensions.width !== width || node.dimensions.height !== height)
    ) {
      await fitView({ nodes: [String(id)], padding: 0.35, maxZoom: 1 })
    }
    if (focused && focusId.value === id) {
      if (props.inDialog) relationStore.dialogFocusId = null
      else {
        relationStore.focusId = null
        relationStore.focusPlacement = null
      }
    }
    return focused
  } finally {
    focusing = false
    if (placement && !disposed && !fitting && viewportInitialized) renderVisibleOnly.value = true
  }
}
watch(
  focusId,
  () => {
    void focusSavedPassword()
  },
  { flush: 'post' },
)

const layout = async (force = false) => {
  if (!nodes.value.length || fitting || disposed) return
  const measured = new Map(graphNodes.value.map((n) => [n.id, n.dimensions]))
  if (nodes.value.some((n) => !measured.get(n.id)?.height)) return
  const version = nodesVersion
  fitting = true
  layoutLoading.value = force
  try {
    if (force) {
      await nextTick()
      await waitForPaint()
      if (disposed || version !== nodesVersion) return
    }
    const missing = nodes.value.some((n) => !positions.value[Number(n.id)])
    if (force || missing) {
      // Vue Flow 在节点挂载时同步 computedPosition，重排期间先完成全部位置更新。
      renderVisibleOnly.value = false
      await nextTick()
      if (disposed || version !== nodesVersion) return
      const layoutPositions = layoutRelationNodes(
        nodes.value.map((node) => ({
          id: node.id,
          ...measured.get(node.id)!,
          position: force ? undefined : positions.value[Number(node.id)],
        })),
        visibleRelations.value.map((relation) => ({
          source: String(relation.sourceId),
          target: String(relation.targetId),
          directed: relation.directed,
        })),
        {
          width: container.value?.clientWidth || 1280,
          height: container.value?.clientHeight || 720,
        },
      )
      nodes.value = nodes.value.map((n) => {
        const next = layoutPositions.get(n.id)!
        positions.value[Number(n.id)] = next
        return { ...n, position: next }
      })
      await nextTick()
    }
    fitting = false
    if (!(await focusSavedPassword()) && (force || !viewportInitialized))
      await fitView({ padding: 0.15, maxZoom: 1 })
    viewportInitialized = true
    renderVisibleOnly.value = true
    await nextTick()
  } catch (error) {
    if (!disposed) ElMessage.error(error instanceof Error ? error.message : '画布加载失败')
  } finally {
    fitting = false
    layoutLoading.value = false
    if (!disposed && version !== nodesVersion) {
      void layout(force)
    } else {
      initialLoading.value = false
    }
  }
}
onNodesInitialized(() => {
  void layout()
})
onNodeDragStop(({ nodes: moved }) => {
  moved.forEach((node) => {
    positions.value[Number(node.id)] = { ...node.position }
  })
})

const canConnect = (connection: Connection) =>
  Boolean(
    connection.source &&
      connection.target &&
      connection.source !== connection.target &&
      !passwordStore.relationIndex.get(Number(connection.source))?.has(Number(connection.target)),
  )
const connect = async (connection: Connection) => {
  if (connecting.value || !canConnect(connection)) return
  connecting.value = true
  try {
    await passwordStore.passwordManager.addPasswordRelations([
      { sourceId: Number(connection.source), targetId: Number(connection.target), directed: true },
    ])
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '关联保存失败')
  } finally {
    connecting.value = false
  }
}
const editEdge = ({ edge, event }: EdgeMouseEvent) => {
  const bounds = container.value?.getBoundingClientRect()
  if (!bounds) return
  const point = 'touches' in event ? event.changedTouches[0] : event
  editor.value = {
    sourceId: Number(edge.source),
    targetId: Number(edge.target),
    x: Math.max(8, Math.min(point.clientX - bounds.left, bounds.width - 290)),
    y: Math.max(8, Math.min(point.clientY - bounds.top, bounds.height - 240)),
  }
}
watch(visibleRelations, (relations) => {
  if (
    editor.value &&
    !relations.some(
      (r) =>
        relationKey(r.sourceId, r.targetId) ===
        relationKey(editor.value!.sourceId, editor.value!.targetId),
    )
  )
    editor.value = null
})
</script>

<template>
  <div
    ref="container"
    v-loading="loading"
    class="password-relations"
    element-loading-text="加载中..."
    :aria-busy="loading"
    @keydown.esc="editor = null"
    @contextmenu.stop.prevent="showContextmenu"
    @click="refStore.contextmenuRef?.hideContextmenu()"
  >
    <div class="relation-view-toolbar">
      <div class="relation-view-controls">
        <el-tooltip content="放大"
          ><el-button :icon="Plus" aria-label="放大" @click="zoomIn()"
        /></el-tooltip>
        <el-tooltip content="缩小"
          ><el-button :icon="Minus" aria-label="缩小" @click="zoomOut()"
        /></el-tooltip>
        <el-tooltip content="适应画面"
          ><el-button
            :icon="FullScreen"
            aria-label="适应画面"
            @click="fitView({ padding: 0.15, maxZoom: 1 })"
        /></el-tooltip>
        <el-tooltip content="重新布局"
          ><el-button :icon="Refresh" aria-label="重新布局" @click="layout(true)"
        /></el-tooltip>
      </div>
    </div>
    <VueFlow
      v-if="graphMounted && nodes.length"
      :id="graphId"
      v-model:nodes="nodes"
      :only-render-visible-elements="renderVisibleOnly"
      :connection-mode="ConnectionMode.Loose"
      :delete-key-code="null"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :zoom-on-double-click="false"
      :min-zoom="0.1"
      :max-zoom="1.5"
      :nodes-connectable="!connecting"
      :edges-updatable="false"
      :elevate-nodes-on-select="false"
      @connect="connect"
      @edge-click="editEdge"
      @pane-click="editor = null"
      @move-start="editor = null"
    >
      <template #node-password="node">
        <RelationNode
          :id="node.id"
          :is-valid-connection="canConnect"
          :selection-enabled="!inDialog"
        />
      </template>
      <template #edge-relation="edge">
        <RelationEdge v-bind="edge" />
      </template>
    </VueFlow>
    <EmptyList v-else-if="!nodes.length" />
    <div
      v-if="editor"
      class="relation-edge-menu"
      :style="{ left: `${editor.x}px`, top: `${editor.y}px` }"
      @pointerdown.stop
    >
      <el-button
        class="relation-edge-close"
        :icon="Close"
        text
        circle
        aria-label="关闭关系操作"
        @click="editor = null"
      />
      <RelationEditor
        :current-id="editor.sourceId"
        :other-id="editor.targetId"
        show-titles
        @done="editor = null"
      />
    </div>
  </div>
</template>

<style scoped>
.password-relations {
  height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--el-fill-color-extra-light);
}
.password-relations :deep(.vue-flow__pane) {
  background-image: radial-gradient(var(--el-border-color) 1px, transparent 1px);
  background-size: 20px 20px;
}
.relation-view-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 5;
  pointer-events: none;
}
.relation-view-toolbar > * {
  pointer-events: auto;
}
.relation-view-controls {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.relation-view-controls .el-button {
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  font-size: 16px;
}
.relation-edge-menu {
  position: absolute;
  z-index: 6;
  width: 260px;
  max-width: calc(100% - 38px);
  padding: 28px 10px 10px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  box-shadow: var(--el-box-shadow-light);
}
.relation-edge-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 24px;
  height: 24px;
  margin: 0;
  padding: 2px;
  font-size: 20px;
}
</style>
