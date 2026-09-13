const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, clone, deferred} = require('./sourceHarness.cjs');

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
