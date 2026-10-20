import { Position } from '@vue-flow/core'
import type { XYPosition } from '@vue-flow/core'

interface RoutingNode {
  position: XYPosition
  dimensions: { width: number; height: number }
}

interface RoutingEdge {
  id: string
  source: string
  target: string
  sourceHandle: Position
  targetHandle: Position
}

export interface RelationEdgeOffsets {
  sourceOffset: XYPosition
  targetOffset: XYPosition
}

interface EdgeEndpoint {
  edgeId: string
  end: keyof RelationEdgeOffsets
  order: number
  span: number
  vertical: boolean
}

const sideNormals: Record<Position, XYPosition> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Right]: { x: 1, y: 0 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
}

function movePoint(point: XYPosition, direction: XYPosition, distance: number): XYPosition {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance }
}

/** 以卡片边界定位连线，连接点自身的大小不改变线与卡片的间距。 */
export function relationEdgeEndpoint(
  node: RoutingNode,
  side: Position,
  offset: XYPosition,
): XYPosition {
  const normal = sideNormals[side]
  return {
    x: node.position.x + (node.dimensions.width * (normal.x + 1)) / 2 + offset.x + normal.x * 2,
    y: node.position.y + (node.dimensions.height * (normal.y + 1)) / 2 + offset.y + normal.y * 2,
  }
}

/** 曲线两端保留短直线，使箭头沿卡片法线接入，短间距时按比例缩短。 */
export function relationEdgePath(
  source: XYPosition,
  target: XYPosition,
  sourceSide: Position,
  targetSide: Position,
): string {
  const sourceNormal = sideNormals[sourceSide]
  const targetNormal = sideNormals[targetSide]
  const dx = target.x - source.x
  const dy = target.y - source.y
  const sourceGap = dx * sourceNormal.x + dy * sourceNormal.y
  const targetGap = -dx * targetNormal.x - dy * targetNormal.y
  const terminalLength = Math.min(12, Math.max(0, Math.min(sourceGap, targetGap)) / 4)
  const curveStart = movePoint(source, sourceNormal, terminalLength)
  const curveEnd = movePoint(target, targetNormal, terminalLength)
  const controlPoint = (from: XYPosition, to: XYPosition, normal: XYPosition) => {
    const gap = (to.x - from.x) * normal.x + (to.y - from.y) * normal.y
    return movePoint(from, normal, gap >= 0 ? gap / 2 : Math.max(12, Math.sqrt(-gap) * 8))
  }
  const sourceControl = controlPoint(curveStart, curveEnd, sourceNormal)
  const targetControl = controlPoint(curveEnd, curveStart, targetNormal)
  return `M${source.x},${source.y} L${curveStart.x},${curveStart.y} C${sourceControl.x},${sourceControl.y} ${targetControl.x},${targetControl.y} ${curveEnd.x},${curveEnd.y} L${target.x},${target.y}`
}

/** 按另一端的位置分散接入点，避免多个分支共享一段连线。 */
export function relationEdgeOffsets(edges: RoutingEdge[], nodes: ReadonlyMap<string, RoutingNode>) {
  const offsets = new Map<string, RelationEdgeOffsets>()
  const groups = new Map<string, EdgeEndpoint[]>()
  for (const edge of edges) {
    const source = nodes.get(edge.source)
    const target = nodes.get(edge.target)
    if (!source || !target) continue
    offsets.set(edge.id, { sourceOffset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 } })
    for (const end of ['source', 'target'] as const) {
      const node = end === 'source' ? source : target
      const other = end === 'source' ? target : source
      const side = end === 'source' ? edge.sourceHandle : edge.targetHandle
      const vertical = side === Position.Top || side === Position.Bottom
      const key = `${edge[end]}:${side}`
      const group = groups.get(key) || []
      group.push({
        edgeId: edge.id,
        end: end === 'source' ? 'sourceOffset' : 'targetOffset',
        order: vertical
          ? other.position.x + other.dimensions.width / 2
          : other.position.y + other.dimensions.height / 2,
        span: vertical ? node.dimensions.width : node.dimensions.height,
        vertical,
      })
      groups.set(key, group)
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.order - b.order || a.edgeId.localeCompare(b.edgeId))
    const halfSpread = Math.min(96, Math.max(0, group[0].span / 2 - 28), (group.length - 1) * 12)
    group.forEach((entry, index) => {
      const offset =
        group.length === 1 ? 0 : -halfSpread + (index * halfSpread * 2) / (group.length - 1)
      offsets.get(entry.edgeId)![entry.end] = entry.vertical
        ? { x: offset, y: 0 }
        : { x: 0, y: offset }
    })
  }
  return offsets
}
