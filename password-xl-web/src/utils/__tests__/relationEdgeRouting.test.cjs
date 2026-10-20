const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.resolve(__dirname, '../relationEdgeRouting.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const routingModule = { exports: {} }
new Function('require', 'module', 'exports', compiled)(
  require,
  routingModule,
  routingModule.exports,
)
const { relationEdgeOffsets, relationEdgeEndpoint, relationEdgePath } = routingModule.exports
const node = (x, y, width = 440, height = 280) => ({
  position: { x, y },
  dimensions: { width, height },
})
const edge = (source, target, sourceHandle = 'bottom', targetHandle = 'top') => ({
  id: [source, target].sort().join(':'),
  source,
  target,
  sourceHandle,
  targetHandle,
})

test('四个方向的端点与卡片保持统一间距，偏移只沿卡片边缘展开', () => {
  const card = node(100, 200)
  assert.deepEqual(relationEdgeEndpoint(card, 'top', { x: -24, y: 0 }), { x: 296, y: 198 })
  assert.deepEqual(relationEdgeEndpoint(card, 'bottom', { x: 24, y: 0 }), { x: 344, y: 482 })
  assert.deepEqual(relationEdgeEndpoint(card, 'left', { x: 0, y: -12 }), { x: 98, y: 328 })
  assert.deepEqual(relationEdgeEndpoint(card, 'right', { x: 0, y: 12 }), { x: 542, y: 352 })
})

test('大跨度曲线在箭头前保持顺直，四个方向和反向后的末端均朝向卡片', () => {
  const normal = {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  }
  const opposite = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }
  const origin = { x: 0, y: 0 }
  for (const [side, n] of Object.entries(normal)) {
    const target = { x: n.x * 100 + n.y * 1000, y: n.y * 100 + n.x * 1000 }
    for (const [from, to, sourceSide, targetSide] of [
      [origin, target, side, opposite[side]],
      [target, origin, opposite[side], side],
    ]) {
      const values = relationEdgePath(from, to, sourceSide, targetSide)
        .match(/-?\d+(?:\.\d+)?/g)
        .map(Number)
      const points = Array.from({ length: values.length / 2 }, (_, i) => ({
        x: values[i * 2],
        y: values[i * 2 + 1],
      }))
      assert.equal(points.length, 6)
      assert.deepEqual(points[0], from)
      assert.deepEqual(points[5], to)
      assert.deepEqual(points[1], {
        x: from.x + normal[sourceSide].x * 12,
        y: from.y + normal[sourceSide].y * 12,
      })
      assert.deepEqual(points[4], {
        x: to.x + normal[targetSide].x * 12,
        y: to.y + normal[targetSide].y * 12,
      })
      const tangent = { x: points[4].x - points[3].x, y: points[4].y - points[3].y }
      assert.equal(Math.abs(tangent.x * normal[targetSide].y - tangent.y * normal[targetSide].x), 0)
    }
  }
})

test('近距离卡片的曲线按比例缩短末段，不反折或越过端点', () => {
  const path = relationEdgePath({ x: 0, y: 0 }, { x: 0, y: 8 }, 'bottom', 'top')
  assert.equal(path, 'M0,0 L0,2 C0,4 0,4 0,6 L0,8')
  for (const target of [
    { x: 0, y: 0 },
    { x: -200, y: -50 },
  ]) {
    assert.doesNotMatch(relationEdgePath({ x: 0, y: 0 }, target, 'bottom', 'top'), /NaN|Infinity/)
  }
})

test('单条曲线保持居中，忽略端点尚未挂载的关系', () => {
  const nodes = new Map([
    ['1', node(0, 0)],
    ['2', node(0, 500)],
  ])
  const offsets = relationEdgeOffsets([edge('1', '2'), edge('1', '3')], nodes)
  assert.equal(offsets.size, 1)
  assert.deepEqual(offsets.get('1:2'), {
    sourceOffset: { x: 0, y: 0 },
    targetOffset: { x: 0, y: 0 },
  })
})

test('分支按目标位置错开接入点，关系数组顺序不改变曲线位置', () => {
  const nodes = new Map([
    ['1', node(0, 0)],
    ['2', node(-600, 500)],
    ['3', node(0, 500)],
    ['4', node(600, 500)],
  ])
  const edges = [edge('1', '4'), edge('1', '2'), edge('1', '3')]
  const offsets = relationEdgeOffsets(edges, nodes)
  assert.deepEqual(offsets.get('1:2').sourceOffset, { x: -24, y: 0 })
  assert.deepEqual(offsets.get('1:3').sourceOffset, { x: 0, y: 0 })
  assert.deepEqual(offsets.get('1:4').sourceOffset, { x: 24, y: 0 })
  assert.deepEqual(relationEdgeOffsets([...edges].reverse(), nodes), offsets)
})

test('汇入与反向连线共享同侧接入点分配，改向后曲线位置不变', () => {
  const nodes = new Map([
    ['1', node(-600, 0)],
    ['2', node(0, 500)],
    ['3', node(600, 0)],
  ])
  const original = relationEdgeOffsets([edge('1', '2'), edge('3', '2')], nodes)
  const reversed = relationEdgeOffsets([edge('2', '1', 'top', 'bottom'), edge('3', '2')], nodes)
  assert.deepEqual(original.get('1:2').targetOffset, { x: -12, y: 0 })
  assert.deepEqual(original.get('2:3').targetOffset, { x: 12, y: 0 })
  assert.deepEqual(reversed.get('1:2').sourceOffset, original.get('1:2').targetOffset)
  assert.deepEqual(reversed.get('2:3'), original.get('2:3'))
})

test('密集水平连线的接入点不超出卡片边缘，尺寸未测量时也保持有效坐标', () => {
  for (const height of [0, 100, 600]) {
    const nodes = new Map([['1', node(0, 0, 440, height)]])
    const edges = Array.from({ length: 30 }, (_, index) => {
      const id = String(index + 2)
      nodes.set(id, node(600, index * 400))
      return edge('1', id, 'right', 'left')
    })
    const offsets = relationEdgeOffsets(edges, nodes)
    const limit = Math.min(96, Math.max(0, height / 2 - 28))
    const values = [...offsets.values()].map((value) => value.sourceOffset.y)
    assert.ok(values.every((value) => Number.isFinite(value) && Math.abs(value) <= limit))
    if (height > 0) assert.equal(new Set(values).size, edges.length)
    assert.ok([...offsets.values()].every((value) => value.sourceOffset.x === 0))
  }
})
