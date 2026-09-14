const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, clone, deferred} = require('./sourceHarness.cjs');

test('remaining password estimate matches real compressed/encrypted growth for one entry and Unicode', t => {
  const h = harness(t);
  const {estimateRemainingPasswords} = h.load('src/service/officialCapacity.ts');
  for (const sample of [h.password(), {...h.password(), title: '邮箱与工作账号🔐', remark: '中文备注'.repeat(30)}]) {
    const encode = entries => h.security.encryptAES('synthetic-key', JSON.stringify(h.compression.compressArray(entries))).length;
    const initialBytes = encode([sample]);
    const sharedBytes = 48000; // Large settings/labels/envelope are paid once, not per password.
    const remaining = 16000;
    const info = {quota: {usedBytes: initialBytes + sharedBytes, quotaBytes: initialBytes + sharedBytes + remaining}};
    const result = estimateRemainingPasswords([sample], info);
    assert.ok(result > 0);
    assert.ok(encode(Array(result + 1).fill(sample)) - initialBytes <= remaining);
    assert.ok(encode(Array(result + 2).fill(sample)) - initialBytes > remaining);
    assert.equal(estimateRemainingPasswords([sample], {quota: {usedBytes: initialBytes, quotaBytes: initialBytes + remaining}}), result);
    const largerSharedField = {...sample, ['shared-field-name'.repeat(150)]: ''};
    const withSchema = estimateRemainingPasswords([largerSharedField], info);
    // A long shared field name changes padding, but does not become per-entry cost.
    const shortSchema = estimateRemainingPasswords([{...sample, a: ''}], info);
    assert.ok(Math.abs(withSchema - shortSchema) <= 1);
  }
});

test('remaining estimate uses all stored entries and responds to size, quota and cleanup changes', t => {
  const h = harness(t);
  const {estimateRemainingPasswords: estimate} = h.load('src/service/officialCapacity.ts');
  const small = h.password(), large = {...h.password(2), remark: 'x'.repeat(2000), status: h.types.PasswordStatus.DELETED};
  const info = {quota: {usedBytes: 10000, quotaBytes: 100000}};
  assert.ok(estimate([small, large], info) < estimate([small], info));
  assert.ok(estimate([small, large], info) > estimate([large], info));
  assert.ok(estimate([small], {...info, quota: {...info.quota, quotaBytes: 200000}}) > estimate([small], info));
  assert.ok(estimate([small], {...info, quota: {...info.quota, usedBytes: 90000}}) < estimate([small], info));
});

test('remaining estimate does not invent empty or unknown samples and clamps full capacity to zero', t => {
  const h = harness(t);
  const {estimateRemainingPasswords: estimate} = h.load('src/service/officialCapacity.ts');
  const info = {quota: {usedBytes: 100, quotaBytes: 10000}};
  assert.equal(estimate([], info), null);
  assert.equal(estimate([h.password()], null), null);
  assert.equal(estimate([h.password()], {...info, usageKnown: false}), null);
  assert.equal(estimate([h.password()], {quota: {...info.quota, checkFailed: true}}), null);
  for (const usedBytes of [10000, 20000]) assert.equal(estimate([h.password()], {quota: {...info.quota, usedBytes}}), 0);
  for (const usedBytes of [-1, NaN, Infinity]) assert.equal(estimate([h.password()], {quota: {...info.quota, usedBytes}}), null);
  assert.equal(estimate([h.password()], {quota: {usedBytes: 0, quotaBytes: 0}}), null);
});

test('quota notifications start at 80 percent and retain full and blocked boundaries', t => {
  const {quotaNotice, quotaStatus} = harness(t).load('src/service/officialPresentation.ts');
  for (const [used, expected] of [[7999, 'NORMAL'], [8000, 'WARNING'], [9999, 'WARNING'], [10000, 'FULL'], [19999, 'FULL'], [20000, 'BLOCKED']]) {
    assert.equal(quotaStatus(used, 10000), expected);
    const info = {usageKnown: true, quota: {usedBytes: used, quotaBytes: 10000}};
    assert.equal(!!quotaNotice(info), used >= 8000);
    assert.equal(quotaNotice({...info, usageKnown: false}), null);
    assert.equal(quotaNotice({...info, quota: {...info.quota, checkFailed: true}}), null);
  }
});

test('account deletion pauses new writes and waits for an existing save before submission', async t => {
  const h = harness(t), pending = deferred();
  h.database.setStoreData = async text => { await pending.promise; h.files.store = text; return {status: true}; };
  const writing = h.manager.addPassword(h.password(2)); await new Promise(setImmediate);
  let submitted = false;
  const deletion = h.manager.withPausedWrites(async () => { submitted = true; });
  await new Promise(setImmediate); assert.equal(submitted, false);
  assert.throws(() => h.manager.addPassword(h.password(3)), /切换存储/);
  pending.resolve(); await writing; await deletion; assert.equal(submitted, true);
});

async function fixture(t) {
  const h = harness(t), calls = [];
  const file = {maxBytes: 1000, fields: {key: 'users/a/v/store.json', policy: 'signed'}, uploadUrl: 'https://oss.test/upload', getUrl: 'https://oss.test/get', headUrl: 'https://oss.test/head'};
  const info = {user: {id: 'a'}, quota: {quotaBytes: 1000, usedBytes: 2, storeBytes: 2, settingBytes: 0}, grant: {files: {'store.json': file, 'setting.json': file}}};
  const state = {epoch: 1, info}; let refreshes = 0;
  const session = {officialState: state, currentOfficialGrant: async () => info.grant, restoreOfficial: async () => {refreshes++; return info;}};
  const {DatabaseForOfficial} = h.load('src/database/DatabaseForOfficial.ts', '', {'@/service/OfficialSession': () => session});
  const db = new DatabaseForOfficial(); await db.login(); refreshes = 0;
  let etag = 'v1', content = '{}';
  h.window.fetch = async (url, options) => {
    calls.push({url, options});
    if (options.method === 'POST') {content = await options.body.get('file').text(); etag = 'v' + calls.length; return new Response('', {headers: {etag}});}
    return new Response(options.method === 'HEAD' ? null : content, {headers: {etag}});
  };
  return {h, db, info, state, calls, refreshes: () => refreshes};
}
test('official grants are reusable and normal saves never request the business backend', async t => {
  const f = await fixture(t); await f.db.getStoreData();
  await f.db.setStoreData('first'); await f.db.setStoreData('second');
  assert.equal(f.refreshes(), 0); assert.equal(f.calls.filter(c => c.options.method === 'POST').length, 2);
  assert.ok(f.calls.every(c => c.options.credentials === 'omit'));
  assert.equal(f.info.quota.usedBytes, 6);
});
test('quota gates permit cleanup but reject edits and recycle-bin restoration', async t => {
  const f = await fixture(t), previous = [f.h.password()];
  f.info.quota.usedBytes = 1000;
  assert.throws(() => f.db.validateStoreChange(previous, [{...previous[0], title: 'changed'}], false), /额度/);
  f.db.validateStoreChange(previous, [], false);
  const deleted = {...previous[0], status: f.h.types.PasswordStatus.DELETED, deleteTime: 10};
  f.db.validateStoreChange(previous, [deleted], false);
  assert.throws(() => f.db.validateStoreChange([deleted], previous, false), /额度/);
  assert.throws(() => f.db.validateStoreChange(previous, clone(previous), true), /额度/);
});
test('projected bytes and changed ETag stop uploads before writing', async t => {
  const f = await fixture(t); await f.db.getStoreData();
  await assert.rejects(f.db.setStoreData('x'.repeat(1001)), /额度/);
  f.h.window.fetch = async () => new Response(null, {headers: {etag: 'other-device'}});
  await assert.rejects(f.db.setStoreData('small'), /其他客户端/);
  assert.equal(f.calls.filter(c => c.options.method === 'POST').length, 0);
});
test('late reads cannot enter a different official account and notes/images are denied', async t => {
  const f = await fixture(t), body = deferred();
  f.h.window.fetch = async () => ({ok: true, status: 200, headers: new Headers({etag: 'v1'}), text: () => body.promise});
  const read = f.db.getStoreData(); await new Promise(setImmediate);
  f.state.epoch++; body.resolve('old vault');
  await assert.rejects(read, /官方账号已变化/);
  await assert.rejects(f.db.setNoteData(), /不支持笔记/);
  await assert.rejects(f.db.uploadImage(), /不支持图片/);
});
test('expired object authorization refreshes once in place', async t => {
  const f = await fixture(t); let requests = 0;
  f.h.window.fetch = async () => ++requests === 1 ? new Response('', {status: 403}) : new Response('{}', {headers: {etag: 'v1'}});
  assert.equal(await f.db.getStoreData(), '{}'); assert.equal(f.refreshes(), 1);
});

test('official logout revokes its session while preserving other storage login caches', async t => {
  const h = harness(t);
  h.localStorage.setItem('loginInfo', 'other-storage-login');
  h.localStorage.setItem('mainPassword', 'other-storage-key');
  h.ls.loginType = 'official';
  h.ls.$resetFields = h.ps.$resetFields = h.ss.$resetFields = () => {};
  const calls = [];
  const {usePasswordStore: store} = h.load('src/stores/PasswordStore.ts', '', {
    'pinia': () => ({defineStore: (id, options) => Object.assign(() => h.ps, options)}),
    '@vueuse/core': () => ({}),
    '@/utils/global.ts': () => ({getLocationUrl: () => 'https://password-xl.cn'}),
    '@/service/PasswordManager.ts': () => ({PasswordManagerImpl: class {}}),
    '@/service/OfficialSession': () => ({officialApi: async path => calls.push(path), clearOfficial: () => calls.push('clear')}),
  });
  await store.actions.logout.call({...store.state(), ...store.actions});
  assert.deepEqual(calls, ['/session/logout', 'clear']);
  assert.equal(h.localStorage.getItem('loginInfo'), 'other-storage-login');
  assert.equal(h.localStorage.getItem('mainPassword'), 'other-storage-key');
});

test('switching to official storage drains old saves and clears plaintext without deleting old login keys', async t => {
  const h = harness(t), save = deferred();
  h.localStorage.setItem('loginInfo', 'old-oss-login');
  h.localStorage.setItem('mainPassword', 'old-oss-unlock');
  h.ss.$resetFields = () => { h.ss.setting = {autoUnlock: false}; };
  h.addTree();
  h.database.setStoreData = async text => { await save.promise; h.files.store = text; return {status: true}; };
  const writing = h.manager.addPassword(h.password(2));
  await new Promise(setImmediate);
  let switched = false;
  const switching = h.manager.prepareForAccountSwitch().then(() => {switched = true;});
  await new Promise(setImmediate);
  assert.equal(switched, false);
  assert.throws(() => h.manager.addPassword(h.password(3)), /切换/);
  save.resolve();
  await writing; await switching;
  assert.equal(h.ps.serviceStatus, h.types.ServiceStatus.NO_LOGIN);
  assert.equal(h.ps.mainPassword, '');
  assert.equal(h.ps.allPasswordArray.length, 0);
  assert.equal(h.ns.noteData.noteTree.length, 0);
  assert.equal(h.manager.databaseClient, null);
  assert.equal(h.manager.storeData, null);
  assert.equal(h.ss.setting.autoUnlock, false);
  assert.equal(h.localStorage.getItem('loginInfo'), 'old-oss-login');
  assert.equal(h.localStorage.getItem('mainPassword'), 'old-oss-unlock');
  const saved = JSON.parse(h.files.store);
  assert.equal(h.decode(saved, 'synthetic-old-key').length, 2);
});
