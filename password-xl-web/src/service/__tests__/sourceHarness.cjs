// Run real TS/Vue scripts with synthetic stores and I/O. No user files or cloud services are accessed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.resolve(__dirname, '../../..');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };

function harness(t) {
  const cache = new Map(), cleanup = [], routeGuards = [], notices = [], listeners = new Set();
  const ui = Object.fromEntries(['success', 'error', 'warning', 'info'].map(level => [level, value => notices.push({level, value})]));
  const storage = () => { const map = new Map(); return {getItem: key => map.get(key) ?? null, setItem: (key, val) => map.set(key, val), removeItem: key => map.delete(key)}; };
  const window = {innerWidth: 1200, crypto: globalThis.crypto, addEventListener: (name, fn) => listeners.add(fn), removeEventListener: (name, fn) => listeners.delete(fn)};
  const environment = {refs: {}, ui, notices, listeners, window, routeGuards, cleanup, localStorage: storage()};
  const load = (file, extra = '', overrides = {}) => {
    if (!extra && !Object.keys(overrides).length && cache.has(file)) return cache.get(file);
    let source = fs.readFileSync(path.join(root, file), 'utf8');
    if (file.endsWith('.vue')) source = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
    const output = ts.transpileModule(source + '\n' + extra, {fileName: file.replace('.d.ts', '.ts').replace('.vue', '.ts'),
      compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true}}).outputText;
    const exports = {};
    const imports = {
      '@/stores/PasswordStore.ts': () => ({usePasswordStore: () => environment.ps}),
      '@/stores/SettingStore.ts': () => ({useSettingStore: () => environment.ss, normalizeSetting() {}}),
      '@/stores/NoteStore.ts': () => ({useNoteStore: () => environment.ns}),
      '@/stores/LoginStore.ts': () => ({useLoginStore: () => environment.ls}),
      '@/stores/RefStore.ts': () => ({useRefStore: () => environment.refs}),
      '@/utils/pinyin.ts': () => ({matchPinyin: () => false}),
      'element-plus': () => ({ElMessage: ui}),
      'vue-router': () => ({onBeforeRouteLeave: fn => routeGuards.push(fn)}),
      'aieditor/dist/style.css': () => ({}),
      'aieditor': () => ({AiEditor: class {constructor(options) {this.options = options; environment.editor = this;} destroy() {} }}),
      ...overrides,
    };
    vm.runInNewContext(output, {exports, require: id => {
      if (imports[id]) return imports[id]();
      if (id.startsWith('@/')) {
        let relative = id.replace('@/', 'src/');
        if (relative === 'src/types') relative += '/index.ts';
        if (relative === 'src/utils/compress') relative += '.d.ts';
        return load(relative);
      }
      return require(id);
    }, Error, console: {log() {}, error() {}, warn() {}}, ...vue,
    watch: (...args) => {const stop = vue.watch(...args); cleanup.push(stop); return stop;},
    onMounted() {}, onUnmounted: fn => cleanup.push(fn), onBeforeUnmount: fn => cleanup.push(fn),
    defineExpose() {}, defineEmits: () => () => {},
    ElNotification: ui, ElMessage: ui, ElMessageBox: () => {},
    window, document: {addEventListener() {}, removeEventListener() {}}, location: {reload() {}},
    localStorage: environment.localStorage, sessionStorage: storage(),
    crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval, clearInterval, Buffer, Uint32Array,
    }, {filename: file});
    if (!extra && !Object.keys(overrides).length) cache.set(file, exports);
    return exports;
  };
  const types = load('src/types/index.ts');
  const security = load('src/utils/security.ts');
  const compression = load('src/utils/compress.d.ts');
  const password = (id = 1) => ({id, title: 'Synthetic test', address: '', username: 'test', password: 'Synthetic-Aa1!', remark: '',
    customFields: [], labels: [], status: types.PasswordStatus.NORMAL, addTime: id, updateTime: id, deleteTime: 0, favoriteTime: 0, favorite: false, bgColor: ''});
  const ps = environment.ps = vue.reactive({allPasswordArray: [password()], labelArray: [], mainPassword: 'synthetic-old-key',
    mainPasswordType: types.MainPasswordType.STANDARD, serviceStatus: types.ServiceStatus.UNLOCKED,
    setServiceStatus(status) {this.serviceStatus = status;}, loading() {this.busy = true;}, unloading() {this.busy = false;}, resetPrivacyMode() {}});
  const ss = environment.ss = vue.reactive({setting: {enableRecycleBin: true, aiModel: {apiKey: ''}}});
  const ns = environment.ns = vue.reactive({noteData: {noteTree: [], currentNote: ''}, getTreeNoteById(id) {
    const find = nodes => {for (const node of nodes) {if (node.id === id) return node; const child = find(node.children || []); if (child) return child;} return null;};
    return find(this.noteData.noteTree);
  }});
  environment.ls = {updateRememberLoginInfo() {}, setAutoLoginInfo() {}};
  const {PasswordManagerImpl} = load('src/service/PasswordManager.ts');
  const manager = vue.markRaw(new PasswordManagerImpl());
  ps.passwordManager = manager;
  manager.storeData = {passwordData: security.encryptAES(ps.mainPassword, JSON.stringify(compression.compressArray(ps.allPasswordArray))),
    labelData: security.encryptAES(ps.mainPassword, '[]'), mainPasswordType: ps.mainPasswordType};
  manager.treeNoteData = null;
  const files = {store: JSON.stringify(manager.storeData), note: '', setting: JSON.stringify(ss.setting)};
  const database = manager.databaseClient = {
    getStoreData: async () => files.store, getTreeNoteData: async () => files.note, getSettingData: async () => files.setting,
    setStoreData: async text => (files.store = text, {status: true}), setNoteData: async text => (files.note = text, {status: true}),
    setSettingData: async text => (files.setting = text, {status: true}),
    getData: async name => files[name] || '', setData: async (name, text) => (files[name] = text, {status: true}),
    deleteData: async name => (delete files[name], {status: true}),
  };
  const addTree = () => {
    ns.noteData.noteTree = ['A', 'B'].map(id => ({id, label: id, children: []}));
    manager.treeNoteData = {noteData: security.encryptAES(ps.mainPassword, JSON.stringify(ns.noteData)), mainPasswordType: ps.mainPasswordType};
    files.note = JSON.stringify(manager.treeNoteData);
  };
  const decode = (store = manager.storeData, key = ps.mainPassword) => clone(compression.decompressionArray(JSON.parse(security.decryptAES(key, store.passwordData))));
  const noteEditor = () => load('src/components/note/NoteEditor.vue', 'export {showNote, saveNote, noteData, lastSyncText, loading, scheduleSave};');
  const dispose = () => {for (const fn of cleanup.splice(0).reverse()) fn();};
  t?.after(dispose);
  return {...environment, load, types, security, compression, password, ps, ss, ns, manager, files, database, addTree, decode, noteEditor, dispose};
}

module.exports = {harness, clone, tick, deferred};
