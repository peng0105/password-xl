import dagre from '@dagrejs/dagre'

interface Position {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

export interface RelationLayoutNode extends Size {
  id: string
  position?: Position
}

interface RelationLayoutEdge {
  source: string
  target: string
  directed?: boolean
}

interface Component {
  nodes: RelationLayoutNode[]
  edges: RelationLayoutEdge[]
}

const margin = 35
const columnGap = 70
const rowGap = 100
const separateComponents = (
  nodes: readonly RelationLayoutNode[],
  edges: readonly RelationLayoutEdge[],
) => {
  const index = new Map(nodes.map((node) => [node.id, node]))
  const neighbors = new Map(nodes.map((node) => [node.id, new Set<string>()]))
  const validEdges = edges.filter(
    ({ source, target }) => source !== target && index.has(source) && index.has(target),
  )
  validEdges.forEach(({ source, target }) => {
    neighbors.get(source)!.add(target)
    neighbors.get(target)!.add(source)
  })
  const membership = new Map<string, Component>()
  const components: Component[] = []
  const isolated: RelationLayoutNode[] = []
  for (const start of nodes) {
    if (!neighbors.get(start.id)!.size) {
      isolated.push(start)
      continue
    }
    if (membership.has(start.id)) continue
    const queue = [start.id]
    const component: Component = { nodes: [], edges: [] }
    membership.set(start.id, component)
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor]
      component.nodes.push(index.get(id)!)
      neighbors.get(id)!.forEach((neighbor) => {
        if (membership.has(neighbor)) return
        membership.set(neighbor, component)
        queue.push(neighbor)
      })
    }
    components.push(component)
  }
  validEdges.forEach((edge) => membership.get(edge.source)!.edges.push(edge))
  return { components, isolated }
}

const layoutComponent = ({ nodes, edges }: Component) => {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'TB', ranker: 'tight-tree', nodesep: columnGap, ranksep: rowGap })
  nodes.forEach((node) => graph.setNode(node.id, { width: node.width, height: node.height }))
  // 无方向关系只用于划分网络，不人为指定上下游；循环由 Dagre 处理回边。
  edges
    .filter((edge) => edge.directed !== false)
    .forEach((edge) => graph.setEdge(edge.source, edge.target))
  dagre.layout(graph)
  const positions = new Map(
    nodes.map((node) => {
      const center = graph.node(node.id)
      return [node.id, { x: center.x - node.width / 2, y: center.y - node.height / 2 }]
    }),
  )
  return { positions, width: graph.graph().width!, height: graph.graph().height! }
}

const overlaps = (first: Position & Size, second: Position & Size) =>
  first.x < second.x + second.width + columnGap &&
  first.x + first.width + columnGap > second.x &&
  first.y < second.y + second.height + rowGap &&
  first.y + first.height + rowGap > second.y

export const layoutRelationNodes = (
  nodes: readonly RelationLayoutNode[],
  edges: readonly RelationLayoutEdge[],
  viewport: Size,
): Map<string, Position> => {
  const positions = new Map<string, Position>()
  if (!nodes.length) return positions
  const fixed = nodes.filter((node) => node.position)
  fixed.forEach((node) => positions.set(node.id, { ...node.position! }))
  if (fixed.length === nodes.length) return positions

  const { components, isolated } = separateComponents(nodes, edges)
  const occupied = fixed.map((node) => ({
    ...node.position!,
    width: node.width,
    height: node.height,
  }))
  const aspect = Math.max(0.5, Math.min(2, viewport.width / Math.max(viewport.height, 1)))
  const blocks = components
    .filter((component) => component.nodes.some((node) => !node.position))
    .map((component) => ({ component, ...layoutComponent(component) }))
  const packWidth = Math.sqrt(
    blocks.reduce((area, block) => area + block.width * block.height, 0) * aspect,
  )
  let x = margin
  let y = margin
  let rowHeight = 0

  for (const block of blocks) {
    const anchor = block.component.nodes.find((node) => node.position)
    if (anchor) {
      const origin = block.positions.get(anchor.id)!
      // 增量展示时保留已有位置，新节点沿该网络的层级定位，只横向避让。
      for (const node of block.component.nodes.filter((node) => !node.position)) {
        const local = block.positions.get(node.id)!
        const rect = {
          x: local.x + anchor.position!.x - origin.x,
          y: local.y + anchor.position!.y - origin.y,
          width: node.width,
          height: node.height,
        }
        let collision = occupied.find((other) => overlaps(rect, other))
        while (collision) {
          rect.x = collision.x + collision.width + columnGap
          collision = occupied.find((other) => overlaps(rect, other))
        }
        positions.set(node.id, { x: rect.x, y: rect.y })
        occupied.push(rect)
      }
      continue
    }

    // 独立网络整体排布，网络内部始终保留自上而下的层级。
    if (x > margin && x + block.width > margin + packWidth) {
      x = margin
      y += rowHeight + rowGap
      rowHeight = 0
    }
    const rect = { x, y, width: block.width, height: block.height }
    let collision = occupied.find((other) => overlaps(rect, other))
    while (collision) {
      rect.y = collision.y + collision.height + rowGap
      collision = occupied.find((other) => overlaps(rect, other))
    }
    for (const node of block.component.nodes) {
      const local = block.positions.get(node.id)!
      const position = { x: rect.x + local.x, y: rect.y + local.y }
      positions.set(node.id, position)
      occupied.push({ ...position, width: node.width, height: node.height })
    }
    x += block.width + columnGap
    rowHeight = Math.max(rowHeight, rect.y + block.height - y)
  }

  if (!isolated.length) return positions
  const matrixTop = components.reduce(
    (bottom, component) =>
      component.nodes.reduce(
        (value, node) => Math.max(value, positions.get(node.id)!.y + node.height + rowGap),
        bottom,
      ),
    margin,
  )
  const cellWidth = Math.max(...isolated.map((node) => node.width)) + columnGap
  const cellHeight = Math.max(...isolated.map((node) => node.height)) + rowGap
  const columns = Math.min(
    isolated.length,
    Math.max(1, Math.ceil(Math.sqrt((isolated.length * aspect * cellHeight) / cellWidth))),
  )
  let slot = 0
  for (const node of isolated.filter((node) => !node.position)) {
    let position: Position
    // 只有孤立密码使用矩阵，新节点占用空位且不推动已有卡片。
    do {
      position = {
        x: margin + (slot % columns) * cellWidth,
        y: matrixTop + Math.floor(slot / columns) * cellHeight,
      }
      slot++
    } while (
      occupied.some((rect) =>
        overlaps({ ...position, width: node.width, height: node.height }, rect),
      )
    )
    positions.set(node.id, position)
  }
  return positions
}
