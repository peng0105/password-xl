const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.resolve(__dirname, '../relationLayout.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText
const layoutModule = { exports: {} }
new Function('require', 'module', 'exports', compiled)(require, layoutModule, layoutModule.exports)
const { layoutRelationNodes } = layoutModule.exports
const desktop = { width: 1280, height: 720 }
const cards = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: String(index + 1), width: 440, height: 280 }))

function bounds(nodes, positions) {
  return {
    width:
      Math.max(...nodes.map((n) => positions.get(n.id).x + n.width)) -
      Math.min(...nodes.map((n) => positions.get(n.id).x)),
    height:
      Math.max(...nodes.map((n) => positions.get(n.id).y + n.height)) -
      Math.min(...nodes.map((n) => positions.get(n.id).y)),
  }
}

function assertSeparated(nodes, positions) {
  assert.equal(positions.size, nodes.length)
  nodes.forEach((node, index) => {
    const first = positions.get(node.id)
    assert.ok(Number.isFinite(first.x) && Number.isFinite(first.y))
    for (const other of nodes.slice(index + 1)) {
      const second = positions.get(other.id)
      assert.ok(
        first.x + node.width <= second.x ||
          second.x + other.width <= first.x ||
          first.y + node.height <= second.y ||
          second.y + other.height <= first.y,
        `卡片 ${node.id} 与 ${other.id} 重叠`,
      )
    }
  })
}

function assertDownstream(nodes, edges, positions) {
  const index = new Map(nodes.map((node) => [node.id, node]))
  for (const { source, target } of edges) {
    assert.ok(
      positions.get(source).y + index.get(source).height < positions.get(target).y,
      `${source} 应在 ${target} 上方`,
    )
  }
}

test('大量孤立密码形成多行多列矩阵，布局比例适合画布', () => {
  const nodes = cards(120)
  const positions = layoutRelationNodes(nodes, [], desktop)
  assertSeparated(nodes, positions)
  assert.ok(new Set([...positions.values()].map((p) => p.x)).size > 1)
  assert.ok(new Set([...positions.values()].map((p) => p.y)).size > 1)
  const size = bounds(nodes, positions)
  assert.ok(size.width / size.height > 1 && size.width / size.height < 2.5)
  assert.deepEqual(layoutRelationNodes(nodes, [], desktop), positions)
})

test('大量宽分支和长链始终沿关系方向分层，不折成矩阵', () => {
  const nodes = cards(48)
  const star = nodes.slice(1).map((n) => ({ source: '1', target: n.id }))
  const chain = nodes.slice(1).map((n, i) => ({ source: nodes[i].id, target: n.id }))
  for (const edges of [star, chain]) {
    const positions = layoutRelationNodes(nodes, edges, desktop)
    assertSeparated(nodes, positions)
    assertDownstream(nodes, edges, positions)
  }
  const starPositions = layoutRelationNodes(nodes, star, desktop)
  assert.equal(new Set(nodes.slice(1).map((n) => starPositions.get(n.id).y)).size, 1)
  const chainPositions = layoutRelationNodes(nodes, chain, desktop)
  assert.equal(new Set([...chainPositions.values()].map((p) => p.x)).size, 1)
})

test('不同卡片高度不重叠，窄屏使用更少列', () => {
  const nodes = cards(30).map((n, i) => ({ ...n, height: i % 4 === 0 ? 650 : 280 }))
  const wide = layoutRelationNodes(nodes, [], desktop)
  const narrow = layoutRelationNodes(nodes, [], { width: 390, height: 844 })
  assertSeparated(nodes, wide)
  assertSeparated(nodes, narrow)
  assert.ok(bounds(nodes, narrow).width < bounds(nodes, wide).width)
})

test('数百个孤立密码不会改变关联网络层级，矩阵在网络下方独立排列', () => {
  const nodes = cards(240)
  const relatedIds = ['1', '12', '24']
  const edges = [
    { source: '1', target: '12' },
    { source: '12', target: '24' },
  ]
  const positions = layoutRelationNodes(nodes, edges, desktop)
  assertSeparated(nodes, positions)
  assertDownstream(nodes, edges, positions)
  const isolated = nodes.filter((node) => !relatedIds.includes(node.id))
  assert.ok(isolated.every((node) => positions.get(node.id).y > positions.get('24').y + 280))
  assert.ok(new Set(isolated.map((node) => positions.get(node.id).x)).size > 1)
  assert.ok(new Set(isolated.map((node) => positions.get(node.id).y)).size > 1)
})

test('新增密码填入空闲矩阵位置，保留手动位置且不持续横向追加', () => {
  const nodes = cards(36)
  const fixed = { ...nodes[0], position: { x: 90, y: -40 } }
  const snapshot = structuredClone(fixed)
  const first = layoutRelationNodes([fixed, ...nodes.slice(1, 18)], [], desktop)
  const expanded = nodes.map((n) => ({ ...n, position: first.get(n.id) }))
  const second = layoutRelationNodes(expanded, [], desktop)
  assertSeparated(nodes, second)
  first.forEach((position, id) => assert.deepEqual(second.get(id), position))
  assert.deepEqual(fixed, snapshot)
  assert.ok(new Set(nodes.slice(18).map((n) => second.get(n.id).y)).size > 1)
  assert.ok(bounds(nodes, second).width < 5000)
  assert.deepEqual(
    layoutRelationNodes(
      nodes.map((n) => ({ ...n, position: second.get(n.id) })),
      [],
      desktop,
    ),
    second,
  )
})

test('小型关联网络保留层级，空画布和单卡片正常布局', () => {
  const nodes = cards(3)
  const positions = layoutRelationNodes(
    nodes,
    [
      { source: '1', target: '2' },
      { source: '2', target: '3' },
    ],
    desktop,
  )
  assert.ok(
    positions.get('1').y < positions.get('2').y && positions.get('2').y < positions.get('3').y,
  )
  assertSeparated(nodes, positions)
  assert.equal(layoutRelationNodes([], [], desktop).size, 0)
  assertSeparated(cards(1), layoutRelationNodes(cards(1), [], desktop))
})

test('大型循环网络保留层级与回边，位置稳定且不重叠', () => {
  const nodes = cards(600)
  const edges = nodes.map((node, index) => ({
    source: node.id,
    target: nodes[(index + 1) % nodes.length].id,
  }))
  const snapshot = structuredClone(edges)
  const positions = layoutRelationNodes(nodes, edges, desktop)
  assertSeparated(nodes, positions)
  assertDownstream(nodes, edges.slice(0, -1), positions)
  assert.ok(positions.get('600').y > positions.get('1').y)
  assert.deepEqual(layoutRelationNodes(nodes, edges, desktop), positions)
  assert.deepEqual(edges, snapshot)
})

test('多个网络保持各自层级，共享数据库只出现一次且避让不同卡片高度', () => {
  const nodes = cards(30).map((node, i) => ({ ...node, height: i % 4 === 0 ? 650 : 280 }))
  const edges = [
    { source: '1', target: '2' },
    { source: '2', target: '3' },
    { source: '2', target: '4' },
    { source: '3', target: '5' },
    { source: '4', target: '5' },
    { source: '4', target: '6' },
    { source: '20', target: '19' },
    { source: '19', target: '18' },
  ]
  for (const viewport of [desktop, { width: 390, height: 844 }]) {
    const positions = layoutRelationNodes(nodes, edges, viewport)
    assertSeparated(nodes, positions)
    assertDownstream(nodes, edges, positions)
  }
})

test('无方向关联不强制上下游，方向翻转后同步改变层级', () => {
  const nodes = cards(3)
  const peers = layoutRelationNodes(nodes, [{ source: '1', target: '2', directed: false }], desktop)
  assert.equal(peers.get('1').y, peers.get('2').y)
  assertSeparated(nodes, peers)
  const edges = [
    { source: '2', target: '1', directed: true },
    { source: '1', target: '3', directed: true },
  ]
  assertDownstream(nodes, edges, layoutRelationNodes(nodes, edges, desktop))
})

test('增量加入上下游时复用已有位置，按层级放置新节点并避让手动位置', () => {
  const nodes = cards(5)
  const edges = [
    { source: '1', target: '2' },
    { source: '2', target: '3' },
    { source: '4', target: '1' },
  ]
  const initial = layoutRelationNodes(nodes.slice(0, 2), edges, desktop)
  const fixed = nodes.map((node) => ({ ...node, position: initial.get(node.id) }))
  fixed[4].position = { x: initial.get('2').x, y: initial.get('2').y + 380 }
  const positions = layoutRelationNodes(fixed, edges, desktop)
  assertSeparated(nodes, positions)
  assertDownstream(nodes, edges, positions)
  initial.forEach((position, id) => assert.deepEqual(positions.get(id), position))
  assert.deepEqual(positions.get('5'), fixed[4].position)
})

test('筛选隐藏的端点和自关联不会影响可见孤立密码的矩阵布局', () => {
  const nodes = cards(20)
  const edges = [
    { source: '1', target: 'hidden' },
    { source: 'hidden', target: '2' },
    { source: '3', target: '3' },
  ]
  assert.deepEqual(
    layoutRelationNodes(nodes, edges, desktop),
    layoutRelationNodes(nodes, [], desktop),
  )
})
