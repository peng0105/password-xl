const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { ref, watch, reactive, computed, effectScope } = require('vue')
const { parse, compileScript } = require('@vue/compiler-sfc')

const src = path.resolve(__dirname, '../..')
global.ref = ref
global.watch = watch
global.computed = computed
global.reactive = reactive
global.window = { addEventListener() {}, innerWidth: 1280, androidAPI: undefined }
global.localStorage = {
  getItem() {
    return null
  },
  removeItem() {},
}
global.ElNotification = { error() {} }
global.ElMessage = { error() {}, warning() {}, success() {} }

// 在真实 TypeScript 模块上测试；仅替换 UI store 和外部存储边界。
function loader(overrides = {}) {
  const cache = new Map()
  function load(request) {
    if (Object.hasOwn(overrides, request)) return overrides[request]
    if (!request.startsWith('@/')) return require(request)
    let filename = path.join(src, request.slice(2))
    if (!path.extname(filename))
      filename += fs.existsSync(filename + '.ts')
        ? '.ts'
        : fs.existsSync(filename + '.d.ts')
          ? '.d.ts'
          : '/index.ts'
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    // compress.d.ts 是此项目既有的可执行压缩模块。
    const source = fs.readFileSync(filename, 'utf8')
    const script = filename.endsWith('.vue')
      ? compileScript(parse(source, { filename }).descriptor, { id: 'recovery-test' }).content
      : source
    const code = ts.transpileModule(script, {
      fileName: filename.replace(/\.d\.ts$/, '.ts'),
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText
    new Function('require', 'module', 'exports', code)(load, module, module.exports)
    return module.exports
  }
  return load
}

const plain = loader()
const relations = plain('@/utils/passwordRelations.ts')
const storage = plain('@/service/relationStorage.ts')
const security = plain('@/utils/security.ts')
const { compressArray } = plain('@/utils/compress')
const { PasswordStatus, ServiceStatus, MainPasswordType } = plain('@/types')
const edge = (sourceId, targetId, directed = true) => ({ sourceId, targetId, directed })
const password = (id) => ({
  id,
  title: `测试密码 ${id}`,
  address: '',
  username: 'demo',
  password: 'sample-only',
  labels: [],
  customFields: [],
  remark: '',
  status: PasswordStatus.NORMAL,
  addTime: id,
  updateTime: id,
  deleteTime: 0,
  favorite: false,
  favoriteTime: 0,
  bgColor: '',
})

async function fixture(initial = [edge(1, 2), edge(2, 3)], options = {}) {
  const store = {
    allPasswordArray: [],
    relations: [],
    labelArray: [],
    mainPassword: '',
    serviceStatus: ServiceStatus.LOGGED,
    get passwordArray() {
      return this.allPasswordArray.filter((p) => p.status === PasswordStatus.NORMAL)
    },
    setServiceStatus(status) {
      this.serviceStatus = status
      if (status !== ServiceStatus.UNLOCKED) this.relations = []
    },
    resetPrivacyMode() {},
    loading() {},
    unloading() {},
  }
  const settings = { setting: { enableRecycleBin: true, aiModel: {} }, $resetFields() {} }
  const officialState = {
    epoch: 1,
    userId: '',
    info: { user: { id: 'test' }, quota: { usedBytes: 10, quotaBytes: 10 } },
  }
  const load = loader({
    '@/stores/PasswordStore.ts': { usePasswordStore: () => store },
    '@/stores/SettingStore.ts': { useSettingStore: () => settings, normalizeSetting() {} },
    '@/stores/LoginStore.ts': {
      useLoginStore: () => ({ setAutoLoginInfo() {}, updateRememberLoginInfo() {} }),
    },
    '@/stores/RefStore.ts': { useRefStore: () => ({}) },
    '@/stores/NoteStore.ts': {
      useNoteStore: () => ({ noteData: { noteTree: [], currentNote: '' } }),
    },
    '@/service/OfficialSession': {
      officialState,
      restoreOfficial: async () => ({}),
      currentOfficialGrant() {},
      officialApi() {},
    },
  })
  const values = {
    passwordData: security.encryptAES(
      'old-test-key',
      JSON.stringify(compressArray([1, 2, 3, 4].map(password))),
    ),
    labelData: security.encryptAES('old-test-key', '[]'),
    mainPasswordType: MainPasswordType.STANDARD,
    ...(options.legacy ? {} : { relationData: storage.encryptRelations(initial, 'old-test-key') }),
  }
  let file = JSON.stringify(values)
  let settingFile = '{}'
  const database = {
    writes: 0,
    fail: false,
    validations: [],
    getStoreData: async () => file,
    getTreeNoteData: async () => '',
    getSettingData: async () => settingFile,
    setSettingData: async (text) => {
      settingFile = text
      return { status: true }
    },
    setStoreData: async (text) => {
      database.writes++
      if (database.fail) return { status: false, message: '模拟写入失败' }
      file = text
      return { status: true }
    },
    validateStoreChange: (...args) => database.validations.push(args),
  }
  const { PasswordManagerImpl } = load('@/service/PasswordManager.ts')
  const manager = new PasswordManagerImpl()
  store.passwordManager = manager
  await manager.login(database)
  assert.equal(manager.unlock('old-test-key'), true)
  return { store, manager, database, settings, load, getFile: () => JSON.parse(file) }
}

test('三种方向、无向规范化及重复和损坏数据校验', () => {
  assert.deepEqual(relations.parseRelations([edge(4, 2, false)]), [edge(2, 4, false)])
  assert.deepEqual(relations.makeRelation(2, 1, 'incoming'), edge(1, 2))
  assert.equal(relations.relationDirection(edge(1, 2), 2), 'incoming')
  assert.equal(relations.relationDirection(edge(1, 2), 1), 'outgoing')
  assert.equal(relations.relationDirection(edge(1, 2, false), 1), 'undirected')
  for (const invalid of [
    null,
    {},
    [edge(1, 1)],
    [edge(1, 2), edge(2, 1)],
    [{ sourceId: 1, targetId: 2 }],
    [edge(-1, 2)],
  ]) {
    assert.throws(() => relations.parseRelations(invalid))
  }
  assert.throws(() => relations.parseRelations([edge(1, 2)], new Set([1])))
})

test('循环及共享依赖遍历终止，计数只包括有效直接邻居', () => {
  const index = relations.buildRelationIndex(
    [edge(1, 2), edge(2, 3), edge(3, 1), edge(3, 4, false), edge(4, 5)],
    new Set([1, 2, 3, 4, 6]),
  )
  assert.equal(index.get(1).size, 2)
  assert.deepEqual([...relations.connectedPasswordIds(1, index)].sort(), [1, 2, 3, 4])
  assert.deepEqual([...relations.connectedPasswordIds(6, index)], [6])
})

test('上下游可独立展开全部层级，共享节点去重且不穿过平级关系', () => {
  const edges = [
    edge(1, 2),
    edge(1, 3),
    edge(11, 3),
    edge(2, 4),
    edge(3, 4),
    edge(4, 5),
    edge(4, 6),
    edge(6, 7),
    edge(4, 8, false),
    edge(8, 9),
  ]
  const index = relations.buildRelationIndex(
    edges,
    new Set(Array.from({ length: 12 }, (_, i) => i + 1)),
  )
  const ids = (direction, all) =>
    [...relations.directionalPasswordIds(4, index, direction, all)].sort((a, b) => a - b)
  assert.deepEqual(ids('incoming', false), [2, 3])
  assert.deepEqual(ids('incoming', true), [1, 2, 3, 11])
  assert.deepEqual(ids('outgoing', false), [5, 6])
  assert.deepEqual(ids('outgoing', true), [5, 6, 7])
  assert.deepEqual(ids('undirected', true), [8])
  assert.deepEqual([...relations.directionalPasswordIds(12, index, 'incoming', true)], [])
  assert.equal(index.get(4).size, 5)
})

test('方向遍历处理循环和深层关系，排除当前密码且不跨越回收站节点', () => {
  const edges = [edge(1, 2), edge(2, 3), edge(3, 1), edge(2, 4), edge(4, 5)]
  const index = relations.buildRelationIndex(edges, new Set([1, 2, 3, 4, 5]))
  assert.deepEqual([...relations.directionalPasswordIds(2, index, 'incoming', true)].sort(), [1, 3])
  assert.deepEqual(
    [...relations.directionalPasswordIds(2, index, 'outgoing', true)].sort(),
    [1, 3, 4, 5],
  )
  const withoutDeleted = relations.buildRelationIndex(edges, new Set([1, 2, 3, 5]))
  assert.deepEqual(
    [...relations.directionalPasswordIds(2, withoutDeleted, 'outgoing', true)].sort(),
    [1, 3],
  )
  const chain = Array.from({ length: 1999 }, (_, i) => edge(i + 1, i + 2))
  const deepIndex = relations.buildRelationIndex(
    chain,
    new Set(Array.from({ length: 2000 }, (_, i) => i + 1)),
  )
  assert.equal(relations.directionalPasswordIds(1, deepIndex, 'outgoing', true).size, 1999)
  assert.equal(relations.directionalPasswordIds(2000, deepIndex, 'incoming', true).size, 1999)
})

test('新增密码沿草稿直接关系展开上下游，遍历不修改已保存关系', () => {
  const edges = [edge(1, 2), edge(2, 3), edge(4, 5), edge(5, 6), edge(6, 4), edge(7, 8)]
  const index = relations.buildRelationIndex(edges, new Set([1, 2, 3, 4, 5, 6, 7, 8]))
  const snapshot = [...index].map(([id, neighbors]) => [id, [...neighbors]])
  const draftEdges = new Map([
    [3, relations.makeRelation(-1, 3, 'incoming')],
    [4, relations.makeRelation(-1, 4, 'outgoing')],
    [7, relations.makeRelation(-1, 7, 'undirected')],
  ])
  assert.deepEqual(
    [...relations.directionalPasswordIds(-1, index, 'incoming', true, draftEdges)].sort(),
    [1, 2, 3],
  )
  assert.deepEqual(
    [...relations.directionalPasswordIds(-1, index, 'outgoing', true, draftEdges)].sort(),
    [4, 5, 6],
  )
  assert.deepEqual(
    [...relations.directionalPasswordIds(-1, index, 'undirected', true, draftEdges)],
    [7],
  )
  assert.deepEqual(
    [...index].map(([id, neighbors]) => [id, [...neighbors]]),
    snapshot,
  )
  assert.equal(index.has(-1), false)
})

test('旧库兼容，加密关系往返及损坏密文拒绝', () => {
  assert.deepEqual(storage.readRelations({}, 'key'), [])
  const value = storage.encryptRelations([edge(1, 2)], 'key')
  assert.deepEqual(storage.readRelations({ relationData: value }, 'key'), [edge(1, 2)])
  assert.throws(() => storage.readRelations({ relationData: value }, 'wrong-key'))
  assert.throws(() => storage.readRelations({ relationData: '' }, 'key'))
  assert.throws(() =>
    storage.readRelations({ relationData: security.encryptAES('key', '{}') }, 'key'),
  )
})

test('解锁只解密密码库一次，错误主密码不会恢复明文或解锁状态', async () => {
  const f = await fixture()
  f.manager.lock()
  assert.equal(f.manager.unlock('incorrect-test-key'), false)
  assert.equal(f.store.serviceStatus, ServiceStatus.LOGGED)
  assert.deepEqual(f.store.allPasswordArray, [])
  assert.deepEqual(f.store.relations, [])
  const cipher = f.getFile().passwordData
  const securityModule = f.load('@/utils/security.ts')
  const decrypt = securityModule.decryptAES
  let passwordDecryptions = 0
  securityModule.decryptAES = (key, content) => {
    if (content === cipher) passwordDecryptions++
    return decrypt(key, content)
  }
  try {
    assert.equal(f.manager.unlock('old-test-key'), true)
    assert.equal(passwordDecryptions, 1)
    assert.equal(f.store.passwordArray.length, 4)
  } finally {
    securityModule.decryptAES = decrypt
  }
})

test('保存新增、改向、无向关系，既有密码内容保持不变', async () => {
  const f = await fixture([], { legacy: true })
  const before = JSON.stringify(f.store.allPasswordArray)
  assert.equal((await f.manager.addPasswordRelations([edge(1, 2)])).status, true)
  assert.equal((await f.manager.updatePasswordRelation(edge(2, 1))).status, true)
  assert.equal((await f.manager.updatePasswordRelation(edge(2, 1, false))).status, true)
  assert.deepEqual(storage.readRelations(f.getFile(), 'old-test-key'), [edge(1, 2, false)])
  assert.equal(JSON.stringify(f.store.allPasswordArray), before)
  await assert.rejects(f.manager.addPasswordRelations([edge(2, 1)]), /重复/)
  assert.equal((await f.manager.removePasswordRelation(2, 1)).status, true)
  assert.deepEqual(storage.readRelations(f.getFile(), 'old-test-key'), [])
})

test('失败保存回退，并使依赖失败快照的排队修改失效', async () => {
  const f = await fixture()
  f.database.fail = true
  const first = f.manager.addPasswordRelations([edge(3, 4)])
  const second = f.manager.updatePasswordRelation(edge(2, 1))
  assert.equal((await first).status, false)
  assert.equal((await second).status, false)
  assert.deepEqual(f.store.relations, [edge(1, 2), edge(2, 3)])
  assert.equal(f.database.writes, 1)
})

test('排队前校验失败也恢复密码和关联，且保留此前成功的排队保存', async () => {
  const f = await fixture()
  const saving = f.manager.addPasswordRelations([edge(3, 4)])
  f.store.allPasswordArray[0].title = '不应保存的草稿'
  f.store.relations.push(edge(1, 99))
  await assert.rejects(f.manager.syncStoreData(), /不存在/)
  assert.equal((await saving).status, true)
  assert.equal(f.database.writes, 1)
  assert.equal(f.store.allPasswordArray[0].title, '测试密码 1')
  assert.deepEqual(f.store.relations, [edge(1, 2), edge(2, 3), edge(3, 4)])
  assert.equal((await f.manager.updatePasswordRelation(edge(2, 1))).status, true)
})

test('没有配额校验器的存储也拒绝覆盖损坏关系，并阻止后续写入', async () => {
  const f = await fixture()
  delete f.database.validateStoreChange
  const file = f.getFile()
  f.manager.storeData.relationData = security.encryptAES('old-test-key', '{}')
  await assert.rejects(
    f.manager.updatePassword({ ...f.store.allPasswordArray[0], title: '不能覆盖' }),
    /停止写入/,
  )
  await assert.rejects(f.manager.removePasswordRelation(1, 2), /存储状态/)
  assert.equal(f.database.writes, 0)
  assert.deepEqual(f.getFile(), file)
})

test('标签密文损坏时解锁不残留部分密码或关联明文', async () => {
  const f = await fixture()
  f.manager.lock()
  f.manager.storeData.labelData = security.encryptAES('old-test-key', '{')
  assert.equal(f.manager.unlock('old-test-key'), false)
  assert.deepEqual(f.store.allPasswordArray, [])
  assert.deepEqual(f.store.relations, [])
  assert.equal(f.store.mainPassword, '')
  assert.equal(f.store.serviceStatus, ServiceStatus.LOGGED)
  assert.equal(f.database.writes, 0)
})

test('旧库普通保存和更换主密码不新增关系字段，不丢失已有密码内容', async () => {
  const f = await fixture([], { legacy: true })
  const passwords = structuredClone(f.store.allPasswordArray)
  assert.equal((await f.manager.syncStoreData()).status, true)
  assert.equal(f.getFile().relationData, undefined)
  assert.equal(
    (await f.manager.updateMainPassword('old-test-key', MainPasswordType.STANDARD, 'new-test-key'))
      .status,
    true,
  )
  assert.equal(f.getFile().relationData, undefined)
  f.manager.lock()
  assert.equal(f.manager.unlock('new-test-key'), true)
  assert.deepEqual(f.store.allPasswordArray, passwords)
})

test('更换主密码写入失败时保留旧密钥和全部关系，可继续解锁', async () => {
  const f = await fixture()
  const file = f.getFile()
  f.database.fail = true
  await assert.rejects(
    f.manager.updateMainPassword('old-test-key', MainPasswordType.STANDARD, 'new-test-key'),
    /模拟写入失败/,
  )
  assert.deepEqual(f.getFile(), file)
  assert.equal(f.store.mainPassword, 'old-test-key')
  f.manager.lock()
  assert.equal(f.manager.unlock('new-test-key'), false)
  assert.equal(f.manager.unlock('old-test-key'), true)
  assert.deepEqual(f.store.relations, [edge(1, 2), edge(2, 3)])
})

test('备份恢复先完成映射再修改当前库，失败不污染来源和目标', async () => {
  const f = await fixture()
  const { preparePasswordRecovery } = f.load('@/service/passwordRecovery.ts')
  const current = {
    passwords: [password(1), { ...password(2), labels: [10] }],
    labels: [{ id: 10, pid: 0, name: '当前标签', children: [] }],
    relations: [edge(1, 2)],
  }
  const backup = {
    passwords: [
      { ...password(1), title: '同 ID 的另一密码', labels: [10] },
      password(2),
      password(3),
    ],
    labels: [{ id: 10, pid: 0, name: '恢复标签', children: [] }],
    relations: [edge(1, 2), edge(2, 3, false)],
  }
  const before = structuredClone({ current, backup })
  const result = preparePasswordRecovery(current, backup, 'merge')
  assert.deepEqual({ current, backup }, before)
  const imported = result.passwords.find((p) => p.title === '同 ID 的另一密码')
  assert.notEqual(imported.id, 1)
  assert.notEqual(imported.labels[0], 10)
  assert.equal(result.labels.find((label) => label.id === imported.labels[0]).name, '恢复标签')
  assert.deepEqual(result.relations, [edge(1, 2), edge(imported.id, 2), edge(2, 3, false)])
  assert.throws(() =>
    preparePasswordRecovery(current, { ...backup, relations: [edge(1, 99)] }, 'merge'),
  )
  assert.throws(
    () =>
      preparePasswordRecovery(
        current,
        { ...backup, passwords: [password(1), password(1)] },
        'cover',
      ),
    /重复/,
  )
  assert.deepEqual({ current, backup }, before)

  const legacy = { passwords: [password(5)], labels: [], relations: [] }
  const covered = preparePasswordRecovery(current, legacy, 'cover')
  const { normalizePasswordArray } = f.load('@/utils/passwordFieldOrder.ts')
  assert.deepEqual(covered, {
    ...legacy,
    passwords: normalizePasswordArray(structuredClone(legacy.passwords)),
  })
  covered.passwords[0].title = '恢复后修改'
  assert.equal(legacy.passwords[0].title, '测试密码 5')
})

test('备份恢复验证期间锁定、切换账号或取消，不写入当前库', async () => {
  for (const interruption of ['lock', 'account', 'cancel']) {
    const scope = effectScope()
    let completeVerification
    let writes = 0
    const manager = {
      syncStoreData: async () => {
        writes++
        return { status: true }
      },
    }
    const store = reactive({
      serviceStatus: ServiceStatus.UNLOCKED,
      passwordManager: manager,
      allPasswordArray: [password(1), password(2)],
      labelArray: [],
      relations: [edge(1, 2)],
      $patch(values) {
        Object.assign(this, values)
      },
    })
    const load = loader({
      '@/stores/PasswordStore.ts': { usePasswordStore: () => store },
      '@/stores/RefStore.ts': {
        useRefStore: () => ({
          verifyPasswordRef: {
            verifySensitive: () =>
              new Promise((resolve) => {
                completeVerification = resolve
              }),
          },
        }),
      },
      'file-saver': {
        saveAs() {
          assert.fail('取消后不应备份或保存')
        },
      },
    })
    try {
      const component = load('@/components/common/setting/BackupAndRecovery.vue').default
      const state = scope.run(() => component.setup({}, { expose() {} }))
      state.recoveryPasswordArray.value = [password(3), password(4)]
      state.recoveryRelations.value = [edge(3, 4)]
      const restoring = state.coverRecovery()
      if (interruption === 'lock') {
        store.serviceStatus = ServiceStatus.LOGGED
        store.serviceStatus = ServiceStatus.UNLOCKED
      } else if (interruption === 'account') {
        store.passwordManager = { ...manager }
      }
      completeVerification(interruption === 'cancel' ? null : 'old-test-key')
      await restoring
      assert.equal(writes, 0)
      assert.deepEqual(
        store.allPasswordArray.map((p) => p.id),
        [1, 2],
      )
      assert.deepEqual(store.relations, [edge(1, 2)])
      assert.equal(state.recovering.value, false)
    } finally {
      scope.stop()
    }
  }
})

test('公共卡片收藏拒绝时不污染对象，删除确认不能跨账号或解锁会话生效', async () => {
  for (const interruption of ['none', 'account', 'lock']) {
    const scope = effectScope()
    let confirmDelete
    let deletes = 0
    const manager = {
      updatePassword: async () => {
        throw new Error('正在切换账号')
      },
      deletePassword: async () => {
        deletes++
        return { status: true }
      },
    }
    const store = reactive({
      serviceStatus: ServiceStatus.UNLOCKED,
      passwordManager: manager,
      allPasswordArray: [password(1)],
      get passwordById() {
        return new Map(this.allPasswordArray.map((p) => [p.id, p]))
      },
    })
    const load = loader({
      '@/stores/PasswordStore.ts': { usePasswordStore: () => store },
      '@/stores/RefStore.ts': { useRefStore: () => ({}) },
      '@/stores/SettingStore.ts': { useSettingStore: () => ({ setting: {} }) },
      '@/stores/RelationStore.ts': { useRelationStore: () => ({}) },
      '@/composables/passwordCardReveal.ts': {
        usePasswordCardReveal: () => ({ showPasswordId: ref(0) }),
      },
    })
    global.ElMessageBox = {
      confirm: () =>
        new Promise((resolve) => {
          confirmDelete = resolve
        }),
    }
    try {
      const component = load('@/components/index/PasswordCard.vue').default
      const item = store.passwordById.get(1)
      const state = scope.run(() => component.setup({ password: item }, { expose() {}, emit() {} }))
      await state.favoritePassword(item)
      assert.equal(item.favorite, false)
      assert.equal(item.favoriteTime, 0)
      state.deletePassword(item)
      if (interruption === 'account') {
        store.passwordManager = { ...manager }
      } else if (interruption === 'lock') {
        store.serviceStatus = ServiceStatus.LOGGED
        store.allPasswordArray = [password(1)]
        store.serviceStatus = ServiceStatus.UNLOCKED
      }
      confirmDelete()
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(deletes, interruption === 'none' ? 1 : 0)
    } finally {
      scope.stop()
      delete global.ElMessageBox
    }
  }
})

test('新建和编辑只在存储确认成功后返回可定位的密码 ID', async () => {
  const f = await fixture()
  const added = await f.manager.addPassword(password(0))
  assert.equal(added.status, true)
  assert.ok(added.passwordId > 4)
  const saved = f.store.passwordArray.find((p) => p.id === added.passwordId)
  assert.ok(saved)
  const edited = await f.manager.updatePassword({ ...saved, title: '已编辑' })
  assert.equal(edited.passwordId, added.passwordId)
  f.database.fail = true
  const failed = await f.manager.updatePassword({ ...saved, title: '未保存' })
  assert.equal(failed.status, false)
  assert.equal(failed.passwordId, undefined)
  assert.equal(f.store.passwordArray.find((p) => p.id === added.passwordId).title, '已编辑')
  const failedAdd = await f.manager.addPassword(password(0))
  assert.equal(failedAdd.status, false)
  assert.equal(failedAdd.passwordId, undefined)
  assert.equal(f.store.passwordArray.length, 5)
})

test('新增密码与三种初始关联一次保存，正式端点使用保存后的 ID', async () => {
  const f = await fixture([edge(1, 2)])
  const drafts = [
    { passwordId: 1, direction: 'incoming' },
    { passwordId: 2, direction: 'undirected' },
    { passwordId: 3, direction: 'outgoing' },
  ]
  const result = await f.manager.addPassword(password(0), drafts)
  assert.equal(result.status, true)
  assert.equal(f.database.writes, 1)
  assert.equal(f.store.passwordArray.length, 5)
  const expected = [
    edge(1, 2),
    edge(1, result.passwordId),
    edge(2, result.passwordId, false),
    edge(result.passwordId, 3),
  ]
  assert.deepEqual(f.store.relations, expected)
  assert.deepEqual(storage.readRelations(f.getFile(), 'old-test-key'), expected)
  assert.equal(f.database.validations.at(-1)[3], true)
  assert.equal(drafts.length, 3)
  assert.ok(f.store.relations.every((relation) => relation.sourceId > 0 && relation.targetId > 0))
})

test('新增密码关联保存失败一起回退，保留输入后重试不会重复新增', async () => {
  const f = await fixture()
  const beforeFile = f.getFile()
  const drafts = [{ passwordId: 1, direction: 'incoming' }]
  f.database.fail = true
  const failed = await f.manager.addPassword(password(0), drafts)
  assert.equal(failed.status, false)
  assert.equal(failed.passwordId, undefined)
  assert.equal(f.store.passwordArray.length, 4)
  assert.deepEqual(f.store.relations, [edge(1, 2), edge(2, 3)])
  assert.deepEqual(f.getFile(), beforeFile)
  assert.deepEqual(drafts, [{ passwordId: 1, direction: 'incoming' }])
  f.database.fail = false
  const retried = await f.manager.addPassword(password(0), drafts)
  assert.equal(retried.status, true)
  assert.equal(f.store.passwordArray.length, 5)
  assert.deepEqual(f.store.relations.at(-1), edge(1, retried.passwordId))
})

test('初始关联目标失效、重复或方向错误时不新增密码，配额失败整体回退', async () => {
  const f = await fixture()
  await f.manager.deletePassword(4)
  const beforeFile = f.getFile()
  const writes = f.database.writes
  for (const drafts of [
    [{ passwordId: 4, direction: 'incoming' }],
    [{ passwordId: 99, direction: 'outgoing' }],
    [
      { passwordId: 1, direction: 'incoming' },
      { passwordId: 1, direction: 'outgoing' },
    ],
    [{ passwordId: 1, direction: 'invalid' }],
  ]) {
    await assert.rejects(f.manager.addPassword(password(0), drafts))
    assert.equal(f.store.allPasswordArray.length, 4)
    assert.equal(f.database.writes, writes)
  }
  f.database.validateStoreChange = () => {
    throw new Error('存储额度不足')
  }
  const result = await f.manager.addPassword(password(0), [
    { passwordId: 2, direction: 'undirected' },
  ])
  assert.equal(result.status, false)
  assert.equal(f.store.allPasswordArray.length, 4)
  assert.deepEqual(f.store.relations, [edge(1, 2), edge(2, 3)])
  assert.deepEqual(f.getFile(), beforeFile)
  assert.equal(f.database.writes, writes)
})

test('同一毫秒新增的关联密码使用不同 ID', async () => {
  const f = await fixture()
  const now = Date.now
  Date.now = () => 1000
  try {
    const first = await f.manager.addPassword(password(0), [
      { passwordId: 1, direction: 'incoming' },
    ])
    const second = await f.manager.addPassword(password(0), [
      { passwordId: first.passwordId, direction: 'incoming' },
    ])
    assert.equal(first.passwordId, 1000)
    assert.equal(second.passwordId, 1001)
    assert.deepEqual(f.store.relations.at(-1), edge(1000, 1001))
  } finally {
    Date.now = now
  }
})

test('回收站保留关系，恢复重新可见，彻底删除及批量删除清理关系', async () => {
  const f = await fixture()
  await f.manager.deletePassword(2)
  assert.equal(f.store.relations.length, 2)
  assert.equal(
    relations.buildRelationIndex(f.store.relations, new Set(f.store.passwordArray.map((p) => p.id)))
      .size,
    0,
  )
  await f.manager.cancelDeletePassword(2)
  assert.equal(f.store.passwordArray.length, 4)
  await f.manager.completelyDeletePassword(2)
  assert.deepEqual(f.store.relations, [])
  await f.manager.addPasswordRelations([edge(1, 3)])
  f.settings.setting.enableRecycleBin = false
  await f.manager.batchDeletePasswords([3])
  assert.deepEqual(f.store.relations, [])
})

test('清空回收站与失败清理回退', async () => {
  const f = await fixture()
  await f.manager.deletePassword(2)
  f.database.fail = true
  assert.equal((await f.manager.emptyRecycle()).status, false)
  assert.equal(f.store.allPasswordArray.length, 4)
  assert.equal(f.store.relations.length, 2)
  f.database.fail = false
  await f.manager.emptyRecycle()
  assert.deepEqual(f.store.relations, [])
})

test('主密码变更重新加密关系，损坏关系阻止变更', async () => {
  const f = await fixture()
  assert.equal(
    (await f.manager.updateMainPassword('old-test-key', MainPasswordType.STANDARD, 'new-test-key'))
      .status,
    true,
  )
  assert.deepEqual(storage.readRelations(f.getFile(), 'new-test-key'), [edge(1, 2), edge(2, 3)])
  assert.throws(() => storage.readRelations(f.getFile(), 'old-test-key'))
  f.manager.lock()
  assert.equal(f.store.relations.length, 0)
  assert.equal(f.manager.unlock('new-test-key'), true)
  assert.equal(f.store.relations.length, 2)

  const broken = await fixture()
  broken.manager.storeData.relationData = security.encryptAES('old-test-key', '{}')
  broken.database.getStoreData = async () => JSON.stringify(broken.manager.storeData)
  await assert.rejects(
    broken.manager.updateMainPassword('old-test-key', MainPasswordType.STANDARD, 'new-test-key'),
  )
  assert.equal(broken.database.writes, 0)
  broken.manager.lock()
  assert.equal(broken.manager.unlock('old-test-key'), false)

  const orphaned = await fixture()
  orphaned.manager.storeData.relationData = storage.encryptRelations([edge(1, 99)], 'old-test-key')
  orphaned.database.getStoreData = async () => JSON.stringify(orphaned.manager.storeData)
  await assert.rejects(
    orphaned.manager.updateMainPassword('old-test-key', MainPasswordType.STANDARD, 'new-test-key'),
    /不存在/,
  )
  assert.equal(orphaned.database.writes, 0)
})

test('锁定期间完成已排队保存不会重新暴露关系', async () => {
  const f = await fixture()
  const saving = f.manager.addPasswordRelations([edge(3, 4)])
  f.manager.lock()
  assert.equal((await saving).status, true)
  assert.deepEqual(f.store.relations, [])
  assert.equal(f.manager.unlock('old-test-key'), true)
  assert.equal(f.store.relations.length, 3)
})

test('备份密码 ID 冲突映射与关系合并，当前库方向优先', async () => {
  const f = await fixture()
  const { mergePassword } = f.load('@/utils/global.ts')
  const existing = [password(1), password(2)]
  const imported = [{ ...password(1), title: '另一条密码' }, password(2), password(3)]
  const idMap = mergePassword(existing, imported)
  assert.notEqual(idMap.get(1), 1)
  assert.equal(idMap.get(2), 2)
  const merged = relations.mergeRelations([edge(2, 3)], [edge(1, 2), edge(3, 2)], idMap)
  assert.deepEqual(merged, [edge(2, 3), edge(idMap.get(1), 2)])
  assert.throws(() => relations.mergeRelations([], [edge(1, 2)], new Map([[1, 3]])))
})

test('配额满时允许关系清理，禁止新增和改向', async () => {
  const f = await fixture()
  const { DatabaseForOfficial } = f.load('@/database/DatabaseForOfficial.ts')
  const database = new DatabaseForOfficial()
  database.epoch = 1
  database.userId = 'test'
  const passwords = [password(1), password(2)]
  assert.equal(relations.relationsModified([edge(1, 2)], []), false)
  assert.equal(relations.relationsModified([edge(1, 2)], [edge(2, 1)]), true)
  assert.doesNotThrow(() => database.validateStoreChange(passwords, passwords, false, false))
  assert.throws(() => database.validateStoreChange(passwords, passwords, false, true), /额度/)
  await f.manager.updatePasswordRelation(edge(2, 1))
  assert.equal(f.database.validations.at(-1)[3], true)
  await f.manager.removePasswordRelation(1, 2)
  assert.equal(f.database.validations.at(-1)[3], false)
})

test('切换账号等待关系保存，随后清除当前账号明文和快照', async () => {
  const f = await fixture()
  const saving = f.manager.addPasswordRelations([edge(3, 4)])
  await f.manager.prepareForAccountSwitch()
  assert.equal((await saving).status, true)
  assert.equal(storage.readRelations(f.getFile(), 'old-test-key').length, 3)
  assert.deepEqual(f.store.relations, [])
  assert.deepEqual(f.store.allPasswordArray, [])
  assert.equal(f.store.mainPassword, '')
  assert.equal(f.manager.storeData, null)
  assert.equal(f.store.serviceStatus, ServiceStatus.NO_LOGIN)
})

test('真实 store 的关系对话框隔离、解除后保留节点、独立导航和锁定时的位置清理', async () => {
  const { createPinia, setActivePinia, disposePinia } = require('pinia')
  const { reactive, watch, nextTick } = require('vue')
  const { PasswordDisplayMode, Sort } = plain('@/types')
  const pinia = createPinia()
  setActivePinia(pinia)
  const settingStore = reactive({
    setting: {
      passwordDisplayMode: PasswordDisplayMode.CARD,
      sortField: 'id',
      sortOrder: Sort.ASC,
    },
  })
  const load = loader({
    '@/service/PasswordManager.ts': {
      PasswordManagerImpl: class {
        async syncSetting() {
          assert.fail('打开关系对话框不应保存全局视图设置')
        }
      },
    },
    '@/stores/SettingStore.ts': { useSettingStore: () => settingStore },
    '@/stores/LoginStore.ts': { useLoginStore: () => ({}) },
    '@/stores/RefStore.ts': { useRefStore: () => ({}) },
    '@/utils/global.ts': {
      searchFields: (query, values) => values.some((value) => value.includes(query)),
    },
  })
  let stopWatching
  try {
    const store = load('@/stores/PasswordStore.ts').usePasswordStore()
    const navigation = load('@/stores/RelationStore.ts').useRelationStore()
    stopWatching = watch([() => navigation.dialogPasswordId, () => store.relationIndex], () => {
      navigation.retainDialogPasswords()
    })
    store.allPasswordArray = [1, 2, 3, 4].map(password)
    const firstIndex = store.passwordById
    assert.equal(firstIndex.get(2).title, '测试密码 2')
    assert.equal(store.passwordById, firstIndex)
    store.allPasswordArray[1].title = '更新后的密码 2'
    assert.equal(store.passwordById.get(2).title, '更新后的密码 2')
    store.allPasswordArray[1].title = '测试密码 2'
    store.relations = [edge(1, 2), edge(2, 3), edge(3, 1)]
    store.setServiceStatus(ServiceStatus.UNLOCKED)
    const relationIndex = store.relationIndex
    settingStore.setting.sortOrder = Sort.DESC
    assert.equal(store.relationIndex, relationIndex)
    settingStore.setting.sortOrder = Sort.ASC
    navigation.openDrawer(1)
    assert.equal(navigation.canGoBack, false)
    assert.deepEqual(navigation.navigation[0].expandedDirections, {
      incoming: false,
      outgoing: false,
    })
    navigation.navigation[0].expandedDirections.incoming = true
    navigation.navigation[0].scrollTop = 246
    navigation.openDrawer(2)
    assert.equal(navigation.canGoBack, true)
    assert.deepEqual(navigation.navigation[1].expandedDirections, {
      incoming: false,
      outgoing: false,
    })
    navigation.navigation[1].expandedDirections.outgoing = true
    navigation.back()
    assert.equal(navigation.currentId, 1)
    assert.equal(navigation.navigation[0].scrollTop, 246)
    assert.deepEqual(navigation.navigation[0].expandedDirections, {
      incoming: true,
      outgoing: false,
    })
    navigation.openDrawer(99)
    assert.equal(navigation.currentId, 1)
    navigation.openDrawer(2)
    navigation.openDrawer(3)
    const allPasswords = [...store.allPasswordArray]
    store.allPasswordArray = store.allPasswordArray.filter((p) => p.id !== 2)
    assert.equal(store.passwordById.has(2), false)
    assert.equal(navigation.canGoBack, true)
    navigation.back()
    assert.equal(navigation.currentId, 1)
    assert.equal(navigation.canGoBack, false)
    navigation.openDrawer(3)
    store.allPasswordArray = store.allPasswordArray.filter((p) => p.id !== 1)
    assert.equal(navigation.canGoBack, false)
    navigation.back()
    assert.equal(navigation.currentId, null)
    store.allPasswordArray = allPasswords
    store.enterBatchOperation()
    store.selectAllVisiblePasswords()
    navigation.openDrawer(1)
    navigation.openGraph(1)
    assert.equal(navigation.currentId, 1)
    assert.equal(navigation.dialogPasswordId, 1)
    assert.equal(settingStore.setting.passwordDisplayMode, PasswordDisplayMode.CARD)
    assert.equal(store.batchOperationEnabled, true)
    assert.deepEqual(store.batchSelectedPasswordIds, [1, 2, 3, 4])
    assert.deepEqual(
      store.visPasswordArray.map((p) => p.id),
      [1, 2, 3, 4],
    )
    assert.deepEqual([...navigation.dialogPasswordIds].sort(), [1, 2, 3])
    store.filterCondition.searchText = '测试密码 2'
    assert.deepEqual(
      store.visPasswordArray.map((p) => p.id),
      [2],
    )
    assert.deepEqual([...navigation.dialogPasswordIds].sort(), [1, 2, 3])
    assert.equal(store.relationIndex.get(2).size, 2)
    navigation.openGraph(99)
    assert.equal(navigation.dialogPasswordId, 1)
    navigation.focusSavedPassword(2)
    assert.equal(navigation.dialogFocusId, 2)
    assert.equal(navigation.focusId, null)
    navigation.focusSavedPassword(4)
    assert.equal(navigation.dialogFocusId, 2)
    assert.equal(store.filterCondition.searchText, '测试密码 2')
    navigation.dialogPositions[1] = { x: 120, y: 240 }
    assert.deepEqual(navigation.positions, {})
    store.relations.push(edge(3, 4))
    await nextTick()
    assert.deepEqual([...navigation.dialogPasswordIds].sort(), [1, 2, 3, 4])
    store.relations = [edge(2, 3)]
    await nextTick()
    assert.equal(store.relationIndex.has(1), false)
    assert.equal(store.relationIndex.has(4), false)
    assert.deepEqual([...navigation.dialogPasswordIds].sort(), [1, 2, 3, 4])
    assert.deepEqual(navigation.dialogPositions[1], { x: 120, y: 240 })
    navigation.focusSavedPassword(4)
    assert.equal(navigation.dialogFocusId, 4)
    store.allPasswordArray.find((p) => p.id === 4).status = PasswordStatus.DELETED
    await nextTick()
    assert.deepEqual([...navigation.dialogPasswordIds].sort(), [1, 2, 3])
    store.allPasswordArray.find((p) => p.id === 4).status = PasswordStatus.NORMAL
    await nextTick()
    assert.deepEqual([...navigation.dialogPasswordIds].sort(), [1, 2, 3])
    navigation.closeGraph()
    assert.deepEqual(navigation.dialogRetainedIds, [])
    navigation.openGraph(1)
    assert.deepEqual([...navigation.dialogPasswordIds], [1])
    store.relations = [edge(1, 2), edge(2, 3), edge(3, 1)]
    await nextTick()
    assert.deepEqual([...navigation.dialogPasswordIds].sort(), [1, 2, 3])
    navigation.closeGraph()
    assert.equal(navigation.dialogPasswordId, null)
    assert.equal(navigation.dialogFocusId, null)
    assert.equal(navigation.currentId, 1)
    assert.equal(store.batchOperationEnabled, true)
    assert.equal(store.filterCondition.searchText, '测试密码 2')
    settingStore.setting.passwordDisplayMode = PasswordDisplayMode.RELATION
    navigation.focusSavedPassword(2)
    assert.equal(navigation.focusId, 2)
    assert.equal(store.filterCondition.searchText, '测试密码 2')
    const placement = {
      position: { x: -125.5, y: 640.25 },
      viewport: { x: 320, y: -100, zoom: 0.6 },
    }
    const placementSnapshot = structuredClone(placement)
    navigation.positions[4] = { x: 5000, y: 8000 }
    navigation.focusSavedPassword(4, placement)
    assert.equal(navigation.focusId, 4)
    assert.deepEqual(navigation.positions[4], placement.position)
    assert.deepEqual(navigation.focusPlacement, placementSnapshot)
    placement.position.x = 999
    placement.viewport.zoom = 1.5
    assert.deepEqual(navigation.positions[4], placementSnapshot.position)
    assert.deepEqual(navigation.focusPlacement, placementSnapshot)
    assert.equal(store.filterCondition.searchText, '')
    assert.ok(store.visPasswordArray.some((p) => p.id === 4))
    navigation.focusSavedPassword(2)
    assert.equal(navigation.focusPlacement, null)
    assert.deepEqual(navigation.positions[4], placementSnapshot.position)
    navigation.focusId = null
    settingStore.setting.passwordDisplayMode = PasswordDisplayMode.CARD
    navigation.focusSavedPassword(2)
    assert.equal(navigation.focusId, null)
    settingStore.setting.passwordDisplayMode = PasswordDisplayMode.RELATION
    navigation.openGraph(1)
    navigation.openDrawer(1)
    assert.equal(navigation.dialogPasswordId, null)
    navigation.focusSavedPassword(4, placementSnapshot)
    assert.equal(navigation.currentId, null)
    assert.equal(navigation.focusId, 4)
    store.filterCondition.searchText = ''
    assert.equal(store.visPasswordArray.length, 4)
    navigation.positions[1] = { x: 100, y: 200 }
    navigation.openDrawer(1)
    navigation.openGraph(1)
    store.setServiceStatus(ServiceStatus.LOGGED)
    assert.deepEqual(store.relations, [])
    assert.deepEqual(navigation.positions, {})
    assert.equal(navigation.currentId, null)
    assert.equal(navigation.dialogPasswordId, null)
    assert.equal(navigation.dialogFocusId, null)
    assert.deepEqual(navigation.dialogPositions, {})
    assert.deepEqual(navigation.dialogRetainedIds, [])
    assert.equal(navigation.focusId, null)
    assert.equal(navigation.focusPlacement, null)
    navigation.focusSavedPassword(1, placementSnapshot)
    assert.equal(navigation.focusId, null)
    assert.equal(navigation.focusPlacement, null)
    assert.deepEqual(navigation.positions, {})
  } finally {
    stopWatching?.()
    disposePinia(pinia)
  }
})
