const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function navigate({referrer = '', cached = false, selected = false, autoLogin = false, failure, mode = 'production'} = {}) {
  let guard, officialCalls = 0, legacyCalls = 0;
  const decisions = [];
  const router = {beforeEach: fn => { guard = fn; }};
  const store = {serviceStatus: 'SIGNED_OUT'};
  const login = {
    async loginOfficial() { officialCalls++; if (failure) throw failure; store.serviceStatus = 'LOGGED'; return true; },
    async autoLogin() { legacyCalls++; return cached; },
  };
  const storage = new Map(cached ? [['loginInfo', 'synthetic-cached-login']] : []);
  if (selected) storage.set('official-selected', 'true');
  const imports = {
    'vue-router': {createRouter: () => router, createWebHashHistory() {}, createWebHistory() {}},
    './routes': [], '@/types': {ServiceStatus: {LOGGED: 'LOGGED', WAIT_INIT: 'WAIT_INIT', UNLOCKED: 'UNLOCKED'}},
    '@/stores/PasswordStore.ts': {usePasswordStore: () => store},
    '@/stores/LoginStore.ts': {useLoginStore: () => login},
    '@/stores/SettingStore.ts': {useSettingStore: () => ({setting: {autoLogin}})},
    '@/service/OfficialSession': {officialOrigin: 'https://account.password-xl.cn'},
  };
  const source = fs.readFileSync(path.join(__dirname, '../../router/index.ts'), 'utf8')
    .replaceAll('import.meta.env.MODE', JSON.stringify(mode));
  const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled, {
    exports: {}, require: id => { assert.ok(id in imports, id); return imports[id]; }, URL,
    document: {referrer}, location: {hash: '', protocol: 'https:'},
    localStorage: {getItem: key => storage.get(key) || null},
    console: {log() {}, error() {}}, window: {history: {replaceState() {}}},
  });
  await guard({path: '/'}, {path: '/'}, destination => decisions.push(destination));
  await new Promise(setImmediate);
  return {officialCalls, legacyCalls, decisions};
}

test('account return to root restores the official session despite remembered alternative storage', async () => {
  assert.deepEqual(await navigate({referrer: 'https://account.password-xl.cn/', cached: true}),
    {officialCalls: 1, legacyCalls: 0, decisions: [undefined]});
});
test('official session restore is independent of the legacy auto-login setting', async () => {
  assert.deepEqual(await navigate({selected: true}), {officialCalls: 1, legacyCalls: 0, decisions: [undefined]});
});
test('anonymous new visitor sees login choices without an account redirect loop', async () => {
  assert.deepEqual(await navigate({failure: {status: 401}}), {officialCalls: 1, legacyCalls: 0, decisions: ['/login']});
});
test('existing alternative storage still auto logs in on ordinary visits', async () => {
  assert.deepEqual(await navigate({cached: true, autoLogin: true, referrer: 'https://unrelated.example/'}),
    {officialCalls: 0, legacyCalls: 1, decisions: [undefined]});
});
test('account service failures go to the official connection screen without selecting another vault', async () => {
  assert.deepEqual(await navigate({referrer: 'https://account.password-xl.cn/', failure: {status: 503}, cached: true}),
    {officialCalls: 1, legacyCalls: 0, decisions: ['/login/official']});
});
test('bundled clients do not probe the official website session', async () => {
  assert.deepEqual(await navigate({mode: 'electron'}), {officialCalls: 0, legacyCalls: 0, decisions: ['/login']});
});
