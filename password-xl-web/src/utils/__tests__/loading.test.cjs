const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function fixture() {
  const events = []
  const frames = []
  const module = { exports: {} }
  const code = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '../loading.ts'), 'utf8'),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    },
  ).outputText
  const dependencies = {
    vue: {
      nextTick: async () => {
        events.push('dom')
      },
    },
    'element-plus': {
      ElLoading: {
        service: (options) => {
          assert.equal(options.fullscreen, true)
          assert.equal(options.lock, true)
          events.push('mask')
          return { close: () => events.push('close') }
        },
      },
    },
  }
  new Function('require', 'module', 'exports', 'requestAnimationFrame', code)(
    (name) => dependencies[name],
    module,
    module.exports,
    (callback) => frames.push(callback),
  )
  const drain = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }
  const paint = async () => {
    frames.splice(0).forEach((callback) => callback(0))
    await drain()
  }
  return { ...module.exports, events, drain, paint }
}

test('遮罩先绘制，随后才执行同步解密，并保持到页面更新结束', async () => {
  const f = fixture()
  let decrypted = false
  const result = f.withLoading(() => {
    decrypted = true
    return 'unlocked'
  })
  assert.equal(f.events[0], 'mask')
  await f.drain()
  assert.equal(decrypted, false)
  await f.paint()
  assert.equal(decrypted, false)
  await f.paint()
  assert.equal(decrypted, true)
  assert.equal(f.events.includes('close'), false)
  await f.paint()
  assert.equal(f.events.includes('close'), false)
  await f.paint()
  assert.equal(await result, 'unlocked')
  assert.equal(f.events.at(-1), 'close')
})

test('校验失败、解密异常和异步异常均关闭遮罩并保留原结果', async () => {
  for (const operation of [
    () => false,
    () => {
      throw new Error('failed')
    },
    async () => {
      throw new Error('failed')
    },
  ]) {
    const f = fixture()
    const result = f.withLoading(operation).then(
      (value) => ({ value }),
      (error) => ({ error }),
    )
    await f.drain()
    for (let frame = 0; frame < 4; frame++) await f.paint()
    const settled = await result
    if (settled.error) assert.equal(settled.error.message, 'failed')
    else assert.equal(settled.value, false)
    assert.equal(f.events.filter((event) => event === 'close').length, 1)
  }
})
