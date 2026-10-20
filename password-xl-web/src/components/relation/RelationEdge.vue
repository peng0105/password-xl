<script setup lang="ts">
import { BaseEdge } from '@vue-flow/core'
import type { EdgeProps } from '@vue-flow/core'
import { relationEdgeEndpoint, relationEdgePath } from '@/utils/relationEdgeRouting.ts'
import type { RelationEdgeOffsets } from '@/utils/relationEdgeRouting.ts'

const props = defineProps<EdgeProps<RelationEdgeOffsets>>()
const path = computed(() =>
  relationEdgePath(
    relationEdgeEndpoint(
      { position: props.sourceNode.computedPosition, dimensions: props.sourceNode.dimensions },
      props.sourcePosition,
      props.data.sourceOffset,
    ),
    relationEdgeEndpoint(
      { position: props.targetNode.computedPosition, dimensions: props.targetNode.dimensions },
      props.targetPosition,
      props.data.targetOffset,
    ),
    props.sourcePosition,
    props.targetPosition,
  ),
)
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path"
    :style="style"
    :marker-start="markerStart"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
  />
</template>
