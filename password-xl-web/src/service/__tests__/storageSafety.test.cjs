const assert = require('node:assert/strict');
const {test} = require('node:test');
const {harness, clone, tick, deferred} = require('./sourceHarness.cjs');

test('Electron forwards write/delete completion, false responses, and read/write rejection', async t => {
  const h = harness(t), pending = deferred();
  h.window.electronAPI = {uploadFile: () => pending.promise, deleteFile: async () => ({status: false}), getFile: async () => {throw new Error('read failed');}};
  const db = new (h.load('src/database/DatabaseForElectron.ts').DatabaseForElectron)();
  let settled = false;
  const write = db.setStoreData('synthetic').then(result => {settled = true; return result;});
  await tick(); assert.equal(settled, false);
  pending.resolve({status: false}); assert.equal((await write).status, false);
  assert.equal((await db.deleteStoreData()).status, false);
  await assert.rejects(db.getStoreData(), /read failed/);
  h.window.electronAPI.uploadFile = async () => {throw new Error('write failed');};
  await assert.rejects(db.setStoreData('synthetic'), /write failed/);
});

function localDatabase(h) {
  const db = new (h.load('src/database/DatabaseForLocal.ts').DatabaseForLocal)();
  const state = {content: JSON.stringify({info: 'old file', storeData: h.files.store, settingData: h.files.setting}), writes: 0, aborted: 0};
  db.fileHandle = {getFile: async () => ({text: async () => state.content}), createWritable: async () => {
    let next;
    return {write: async text => {state.writes++; next = text; if (state.fail) throw new Error('disk full');},
      close: async () => {state.content = next;}, abort: async () => {state.aborted++;}};
  }};
  return {db, state};
}

test('local writes preserve the original container and serialize password/settings updates', async t => {
  const h = harness(t), {db, state} = localDatabase(h);
  await Promise.all([db.setStoreData('new-store'), db.setSettingData('new-setting')]);
  const content = JSON.parse(state.content);
  assert.equal(content.storeData, 'new-store'); assert.equal(content.settingData, 'new-setting');
  assert.deepEqual(Object.keys(content).sort(), ['info', 'settingData', 'storeData']);
  state.fail = true; const before = state.content;
  await assert.rejects(db.setStoreData('failed'), /disk full/);
  assert.equal(state.content, before); assert.equal(state.aborted, 1);
});

test('local read failure never becomes an empty vault during settings save', async t => {
  const h = harness(t), {db, state} = localDatabase(h);
  db.fileHandle.getFile = async () => {throw new Error('permission denied');};
  await assert.rejects(db.setSettingData('changed'), /permission denied/);
  assert.equal(state.writes, 0);
});

for (const kind of ['false', 'reject']) {
  for (const operation of ['add', 'update', 'delete', 'permanentDelete', 'restore', 'batchDelete', 'emptyRecycle', 'import']) {
    test(`${operation}: ${kind} restores the last saved vault and labels`, async t => {
      const h = harness(t), {manager: m, ps, database} = h;
      if (['restore', 'emptyRecycle'].includes(operation)) {
        ps.allPasswordArray[0].status = h.types.PasswordStatus.DELETED;
        await m.syncStoreData();
      }
      const before = h.decode(), labels = clone(ps.labelArray), ciphertext = clone(m.storeData);
      database.setStoreData = async () => {if (kind === 'reject') throw new Error('synthetic failure'); return {status: false};};
      const operations = {
        add: () => m.addPassword(h.password(2)), update: () => m.updatePassword({...h.password(), title: 'changed'}),
        delete: () => m.deletePassword(1), permanentDelete: () => m.completelyDeletePassword(1),
        restore: () => m.cancelDeletePassword(1), batchDelete: () => m.batchDeletePasswords([1]),
        emptyRecycle: () => m.emptyRecycle(), import: () => {
          ps.allPasswordArray.push(h.password(2)); ps.labelArray.push({id: 7, pid: 0, name: 'Imported', children: []}); return m.syncStoreData();
        },
      };
      assert.equal((await operations[operation]()).status, false);
      assert.deepEqual(h.decode(), before); assert.deepEqual(clone(m.storeData), ciphertext);
      assert.deepEqual(clone(ps.labelArray), labels);
      assert.deepEqual(clone(ps.allPasswordArray).map(p => [p.id, p.title, p.status]), before.map(p => [p.id, p.title, p.status]));
    });
  }
}

test('a failed write cancels dependent queued snapshots; retry starts from the saved vault', async t => {
  const h = harness(t), first = deferred(); let writes = 0;
  h.database.setStoreData = async text => {writes++; if (writes === 1) return first.promise; h.files.store = text; return {status: true};};
  const a = h.manager.updatePassword({...h.password(), title: 'failed change'});
  const b = h.manager.addPassword(h.password(2));
  await tick(); assert.equal(writes, 1);
  first.resolve({status: false}); assert.equal((await a).status, false); assert.equal((await b).status, false);
  assert.equal(writes, 1); assert.equal(h.ps.allPasswordArray.length, 1);
  assert.equal((await h.manager.updatePassword({...h.password(), title: 'retry'})).status, true);
  assert.equal(h.decode()[0].title, 'retry'); assert.equal(h.decode().length, 1);
});

test('a later failed save preserves an earlier successful queued change', async t => {
  const h = harness(t); let writes = 0;
  h.database.setStoreData = async text => {if (++writes === 2) throw new Error('second failed'); h.files.store = text; return {status: true};};
  const a = h.manager.updatePassword({...h.password(), title: 'first saved'});
  const b = h.manager.addPassword(h.password(2));
  assert.equal((await a).status, true); assert.equal((await b).status, false);
  assert.equal(h.ps.allPasswordArray.length, 1); assert.equal(h.ps.allPasswordArray[0].title, 'first saved');
});

test('locking during a failed write never restores plaintext into the locked store', async t => {
  const h = harness(t), pending = deferred();
  h.database.setStoreData = () => pending.promise;
  const save = h.manager.addPassword(h.password(2)); await tick();
  h.manager.lock(); pending.resolve({status: false}); await save;
  assert.equal(h.ps.mainPassword, ''); assert.equal(h.ps.allPasswordArray.length, 0);
  assert.equal(h.manager.unlock('synthetic-old-key'), true); assert.equal(h.ps.allPasswordArray.length, 1);
});

test('data rejection settles, failed writes do not enter cache, and successful deletion invalidates cache', async t => {
  const h = harness(t);
  h.database.getData = async () => {throw new Error('read failed');};
  await assert.rejects(h.manager.getData('note/A.html'), /read failed/);
  h.database.getData = async () => 'saved';
  h.database.setData = async () => ({status: false});
  assert.equal((await h.manager.setData('note/A.html', 'unsaved')).status, false);
  assert.equal(await h.manager.getData('note/A.html'), 'saved');
  await h.manager.delData('note/A.html'); h.database.getData = async () => '';
  assert.equal(await h.manager.getData('note/A.html'), '');
});

test('saved note tree survives lock/unlock and failed tree save restores the saved tree', async t => {
  const h = harness(t); h.addTree();
  h.ns.noteData.noteTree.push({id: 'C', label: 'C', children: []});
  assert.equal((await h.manager.syncNoteData()).status, true);
  h.manager.lock(); assert.equal(h.manager.unlock('synthetic-old-key'), true);
  assert.equal(h.ns.noteData.noteTree.length, 3);
  h.database.setNoteData = async () => ({status: false}); h.ns.noteData.noteTree.pop();
  assert.equal((await h.manager.syncNoteData()).status, false); assert.equal(h.ns.noteData.noteTree.length, 3);
});

test('local password change updates password/settings once without creating a note file or migrating data', async t => {
  const h = harness(t), {db, state} = localDatabase(h);
  h.manager.databaseClient = db; const before = h.decode();
  await h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key');
  const stored = JSON.parse(JSON.parse(state.content).storeData);
  assert.equal(state.writes, 1); assert.equal(h.manager.treeNoteData, null);
  assert.deepEqual(h.decode(stored, 'synthetic-new-key'), before);
  assert.deepEqual(Object.keys(stored).sort(), ['labelData', 'mainPasswordType', 'passwordData']);
  h.manager.lock(); assert.equal(h.manager.unlock('synthetic-new-key'), true);
});

test('local password change failure leaves old file, old key and loading state intact', async t => {
  const h = harness(t), {db, state} = localDatabase(h); const before = state.content;
  h.manager.databaseClient = db; state.fail = true;
  await assert.rejects(h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key'), /disk full/);
  assert.equal(state.content, before); assert.equal(h.ps.mainPassword, 'synthetic-old-key'); assert.equal(h.ps.busy, false);
});

for (const stage of ['note', 'setting', 'store']) {
  for (const committed of [false, true]) {
    test(`password change restores every file when ${stage} fails ${committed ? 'after' : 'before'} committing`, async t => {
      const h = harness(t); h.addTree();
      h.ss.setting.aiModel.apiKey = h.security.encryptAES('synthetic-old-key', 'synthetic-api-key');
      h.files.setting = JSON.stringify(h.ss.setting);
      const before = clone(h.files); let failed = false;
      const method = {note: 'setNoteData', setting: 'setSettingData', store: 'setStoreData'}[stage];
      const original = h.database[method];
      h.database[method] = async text => {
        if (!failed) {failed = true; if (committed) await original(text); throw new Error('synthetic failure');}
        return original(text);
      };
      await assert.rejects(h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key'), /synthetic failure/);
      assert.deepEqual(h.files, before); assert.equal(h.ps.mainPassword, 'synthetic-old-key'); assert.equal(h.ps.busy, false);
      assert.equal(h.manager.verifyPassword('synthetic-old-key'), true);
    });
  }
}

test('uncertain rollback blocks further writes and does not overwrite an unrelated version', async t => {
  const h = harness(t); h.addTree();
  h.database.setStoreData = async () => {h.files.note = 'unrelated external version'; throw new Error('connection lost');};
  await assert.rejects(h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key'), /无法确认/);
  assert.equal(h.files.note, 'unrelated external version');
  assert.throws(() => h.manager.addPassword(h.password(2)), /存储状态尚未确认/);
  assert.equal(h.ps.busy, false);
});

test('password comparison preserves field boundaries and custom values but ignores generated UI IDs', t => {
  const h = harness(t), {comparePassword} = h.load('src/utils/global.ts');
  assert.equal(comparePassword({...h.password(), title: 'ab', username: 'c'}, {...h.password(), title: 'a', username: 'bc'}), false);
  assert.equal(comparePassword(h.password(), {...h.password(), customFields: [{key: 'recovery', val: 'unique', hidden: true}]}), false);
  assert.equal(comparePassword({...h.password(), customFields: [{id: 'old', key: 'k', val: 'v', hidden: true}]},
    {...h.password(), customFields: [{id: 'new', key: 'k', val: 'v', hidden: true}]}), true);
});

test('label merging maps parent, child and password references across collisions in later siblings', t => {
  const h = harness(t), {mergeLabel, mergePassword} = h.load('src/utils/global.ts');
  const labels = [{id: 1, pid: 0, name: 'First', children: [{id: 2, pid: 1, name: 'Child', children: []}]}, {id: 7, pid: 0, name: 'Existing', children: []}];
  const incoming = [{id: 7, pid: 0, name: 'Imported', children: [{id: 2, pid: 7, name: 'Imported child', children: []}]}];
  const original = clone(incoming), map = mergeLabel(labels, incoming);
  assert.deepEqual(incoming, original);
  assert.notEqual(map.get(7), 7); assert.notEqual(map.get(2), 2);
  assert.equal(labels[2].children[0].pid, map.get(7));
  const passwords = []; const restored = {...h.password(), labels: [7, 2].map(id => map.get(id))};
  mergePassword(passwords, [restored]); assert.deepEqual(passwords[0].labels, [labels[2].id, labels[2].children[0].id]);
});

test('all lock entry points clear the displayed long password synchronously', t => {
  const h = harness(t);
  const dialog = h.load('src/components/common/ShowPassword.vue', 'export {showPassword, closePassword, viewPassword};');
  h.refs.showPasswordRef = dialog;
  dialog.showPassword({...h.password(), password: 'synthetic-long'.repeat(8)});
  assert.equal(dialog.viewPassword.alertVisible, true);
  h.manager.lock();
  assert.equal(dialog.viewPassword.alertVisible, false); assert.equal(dialog.viewPassword.content, ''); assert.equal(dialog.viewPassword.title, '');
  dialog.showPassword(h.password()); assert.equal(dialog.viewPassword.alertVisible, false);
});

test('note switching discards stale responses and selects only the latest request', async t => {
  const h = harness(t); h.addTree();
  const pending = {A: deferred(), B: deferred()};
  h.database.getData = name => pending[name.includes('/A.') ? 'A' : 'B'].promise;
  const editor = h.noteEditor();
  const a = editor.showNote(h.ns.getTreeNoteById('A')); await tick();
  const b = editor.showNote(h.ns.getTreeNoteById('B')); await tick();
  pending.B.resolve(''); assert.equal(await b, true);
  pending.A.resolve(''); assert.equal(await a, false);
  assert.equal(editor.noteData.value.id, 'B'); assert.equal(h.ns.noteData.currentNote, 'B');
});

test('note save failure stays dirty, gives no success and prevents switching or leaving', async t => {
  const h = harness(t); h.addTree(); const editor = h.noteEditor();
  await editor.showNote(h.ns.getTreeNoteById('A')); editor.noteData.value.content = 'unsaved';
  h.database.setData = async () => ({status: false});
  assert.equal(await editor.saveNote(true), false);
  assert.notEqual(editor.lastSyncText.value, JSON.stringify(editor.noteData.value));
  assert.equal(h.notices.some(n => n.level === 'success'), false);
  assert.equal(await editor.showNote(h.ns.getTreeNoteById('B')), false);
  assert.equal(editor.noteData.value.id, 'A'); assert.equal(h.ns.noteData.currentNote, 'A');
  assert.equal(await h.routeGuards[0](), false);
  h.database.setData = async () => ({status: true}); assert.equal(await editor.saveNote(true), true);
  assert.equal(editor.lastSyncText.value, JSON.stringify(editor.noteData.value));
});

test('edits during a note write remain dirty and the old write cannot rename another note', async t => {
  const h = harness(t); h.addTree(); const editor = h.noteEditor();
  await editor.showNote(h.ns.getTreeNoteById('A'));
  editor.noteData.value.name = 'A renamed'; editor.noteData.value.content = 'first';
  const pending = deferred(); h.database.setData = () => pending.promise;
  const save = editor.saveNote(); await tick();
  editor.noteData.value.content = 'second'; pending.resolve({status: true}); await save;
  assert.notEqual(editor.lastSyncText.value, JSON.stringify(editor.noteData.value));
  assert.equal(h.ns.getTreeNoteById('A').label, 'A renamed'); assert.equal(h.ns.getTreeNoteById('B').label, 'B');
});

test('note unmount cancels autosave and ignores a pending load response', async t => {
  const h = harness(t); h.addTree(); const pending = deferred();
  h.database.getData = () => pending.promise; const editor = h.noteEditor();
  const show = editor.showNote(h.ns.getTreeNoteById('A')); await tick(); h.dispose(); pending.resolve('');
  assert.equal(await show, false); assert.equal(editor.noteData.value.id, ''); assert.equal(h.listeners.size, 0);
});

test('a late data read cannot replace a newer successful cache write', async t => {
  const h = harness(t), pending = deferred();
  h.database.getData = () => pending.promise;
  const oldRead = h.manager.getData('note/A.html'); await tick();
  await h.manager.setData('note/A.html', 'new data');
  pending.resolve('old data'); await oldRead;
  assert.equal(await h.manager.getData('note/A.html'), 'new data');
});

test('an old account write failure cannot roll back the newly logged-in account', async t => {
  const h = harness(t), pending = deferred();
  h.database.setStoreData = () => pending.promise;
  const save = h.manager.updatePassword({...h.password(), title: 'old account edit'}); await tick();
  h.ps.passwordManager = {}; h.ps.allPasswordArray = [{...h.password(55), title: 'different account'}];
  pending.resolve({status: false}); await save;
  assert.equal(h.ps.allPasswordArray[0].title, 'different account');
});

test('successful remote key change preserves decrypted legacy data, settings, and note body bytes', async t => {
  const h = harness(t); h.addTree();
  h.ss.setting.aiModel.apiKey = h.security.encryptAES('synthetic-old-key', 'synthetic-api-key');
  h.files.setting = JSON.stringify({...h.ss.setting, unknownLegacyOption: {keep: true}});
  h.files['note/A.html'] = '{"id":"A","name":"A","content":"<p>legacy</p>","updateTime":1}';
  const beforePasswords = h.decode(), beforeNote = h.files['note/A.html'];
  const beforeTree = h.security.decryptAES('synthetic-old-key', h.manager.treeNoteData.noteData);
  await h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key');
  assert.deepEqual(h.decode(), beforePasswords); assert.equal(h.files['note/A.html'], beforeNote);
  assert.equal(h.security.decryptAES('synthetic-new-key', h.manager.treeNoteData.noteData), beforeTree);
  assert.deepEqual(JSON.parse(h.files.setting).unknownLegacyOption, {keep: true});
  assert.equal(h.security.decryptAES('synthetic-new-key', JSON.parse(h.files.setting).aiModel.apiKey), 'synthetic-api-key');
});

test('changing key without a note tree or AI secret only writes the vault', async t => {
  const h = harness(t); let otherWrites = 0;
  h.database.setSettingData = h.database.setNoteData = async () => {otherWrites++; throw new Error('unexpected write');};
  await h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key');
  assert.equal(otherWrites, 0); assert.equal(h.manager.verifyPassword('synthetic-new-key'), true);
});

test('key change with an unreadable old note tree stops before writing anything', async t => {
  const h = harness(t); h.addTree();
  h.manager.treeNoteData.noteData = h.security.encryptAES('another-key', 'invalid for old key');
  h.files.note = JSON.stringify(h.manager.treeNoteData); const before = clone(h.files);
  await assert.rejects(h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key'));
  assert.deepEqual(h.files, before); assert.equal(h.ps.busy, false);
});

test('externally changed vault is detected before key rotation touches any file', async t => {
  const h = harness(t); h.files.store = JSON.stringify({...h.manager.storeData, passwordData: 'external content'});
  const before = clone(h.files);
  await assert.rejects(h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key'), /存储文件已发生变化/);
  assert.deepEqual(h.files, before);
});

test('key rotation reads through previously queued saves and does not unlock after an intervening lock', async t => {
  const h = harness(t), pending = deferred(); let writes = 0;
  const original = h.database.setStoreData;
  h.database.setStoreData = async text => {if (++writes === 1) await pending.promise; return original(text);};
  const edit = h.manager.updatePassword({...h.password(), title: 'saved before rotation'});
  const rotation = h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key');
  h.manager.lock(); pending.resolve(); await edit; await rotation;
  assert.equal(h.ps.mainPassword, ''); assert.equal(h.ps.allPasswordArray.length, 0);
  assert.equal(h.manager.unlock('synthetic-new-key'), true); assert.equal(h.ps.allPasswordArray[0].title, 'saved before rotation');
});

test('successful first write remains readable by the unchanged legacy decoder', async t => {
  const h = harness(t);
  // The source compressor/encryption functions are unchanged; use a record without new optional UI fields.
  const legacy = h.password(); delete legacy.customFields;
  h.manager.storeData = {passwordData: h.security.encryptAES(h.ps.mainPassword, JSON.stringify(h.compression.compressArray([legacy]))),
    labelData: h.security.encryptAES(h.ps.mainPassword, '[]'), mainPasswordType: h.ps.mainPasswordType};
  h.files.store = JSON.stringify(h.manager.storeData);
  h.manager.lock(); assert.equal(h.manager.unlock('synthetic-old-key'), true);
  await h.manager.updatePassword({...h.ps.allPasswordArray[0], title: 'updated'});
  const stored = JSON.parse(h.files.store);
  const decoded = h.decode(stored, 'synthetic-old-key');
  assert.equal(decoded[0].password, legacy.password); assert.equal(decoded[0].title, 'updated');
  assert.deepEqual(Object.keys(stored).sort(), ['labelData', 'mainPasswordType', 'passwordData']);
});

for (const provider of ['OSS', 'COS', 'Private']) {
  test(`${provider} rejects a failed version check without writing or hanging`, async t => {
    const h = harness(t);
    const fakeAxios = {post: async () => {throw new Error('version check failed');}};
    const source = h.load('src/database/DatabaseFor' + provider + '.ts', '', {
      'ali-oss': () => class {}, 'cos-js-sdk-v5': () => class {}, 'axios': () => fakeAxios,
    });
    const db = new source['DatabaseFor' + provider]();
    db.fileEtags['password-xl/store.json'] = 'old';
    let writes = 0;
    db.ossClient = {head: async () => {throw new Error('version check failed');}, put: async () => {writes++;}};
    db.cosClient = {headObject: (options, callback) => callback(new Error('version check failed')), putObject: () => {writes++;}};
    await assert.rejects(db.setStoreData('synthetic'));
    assert.equal(writes, 0);
  });
}

test('OSS post-write HEAD failure is not falsely reported as a rejected write', async t => {
  const h = harness(t);
  const {DatabaseForOSS} = h.load('src/database/DatabaseForOSS.ts', '', {'ali-oss': () => class {}});
  const db = new DatabaseForOSS();
  db.ossClient = {put: async () => ({res: {headers: {}}}), head: async () => {throw new Error('head failed');}};
  assert.equal((await db.setStoreData('synthetic')).status, true);
  await assert.rejects(db.setStoreData('later data'), /head failed/);
});

test('COS preserves its existing JSON string envelope when writing', async t => {
  const h = harness(t);
  const {DatabaseForCOS} = h.load('src/database/DatabaseForCOS.ts', '', {'cos-js-sdk-v5': () => class {}});
  const db = new DatabaseForCOS(); let stored;
  db.cosClient = {putObject: (options, callback) => {stored = options.Body; callback(null, {ETag: 'new'});}};
  assert.equal((await db.setStoreData('{"synthetic":true}')).status, true);
  assert.equal(stored, JSON.stringify('{"synthetic":true}'));
});

test('auto login handles an adapter rejection and always releases loading', async t => {
  const h = harness(t);
  const {useLoginStore: store} = h.load('src/stores/LoginStore.ts', '', {
    'pinia': () => ({defineStore: (id, options) => options}),
    '@/database/DatabaseForPrivate.ts': () => ({DatabaseForPrivate: class {async login() {throw new Error('login failed');}}}),
  });
  const context = {...store.state(), ...store.actions};
  assert.equal(await context.startLogin({loginType: 'private'}, 'synthetic'), false);
  assert.equal(h.ps.busy, false);
});

test('a note title sync failure remains retryable after its content write succeeds', async t => {
  const h = harness(t); h.addTree(); const editor = h.noteEditor();
  await editor.showNote(h.ns.getTreeNoteById('A')); editor.noteData.value.name = 'renamed';
  const original = h.database.setNoteData; h.database.setNoteData = async () => ({status: false});
  assert.equal(await editor.saveNote(), false); assert.equal(h.ns.getTreeNoteById('A').label, 'A');
  assert.notEqual(editor.lastSyncText.value, JSON.stringify(editor.noteData.value));
  h.database.setNoteData = original; assert.equal(await editor.saveNote(), true);
  assert.equal(h.ns.getTreeNoteById('A').label, 'renamed');
});

test('key change cannot strand a saved AI secret that is missing from the current settings', async t => {
  const h = harness(t);
  h.files.setting = JSON.stringify({aiModel: {apiKey: h.security.encryptAES('synthetic-old-key', 'external-secret')}});
  const before = clone(h.files);
  await assert.rejects(h.manager.updateMainPassword('synthetic-old-key', h.types.MainPasswordType.STANDARD, 'synthetic-new-key'), /AI配置尚未同步/);
  assert.deepEqual(h.files, before);
});

test('batch label failure restores both previous references and the encrypted snapshot', async t => {
  const h = harness(t);
  h.ps.labelArray.push({id: 7, pid: 0, name: 'Existing', children: []}); await h.manager.syncStoreData();
  const before = clone(h.manager.storeData);
  h.database.setStoreData = async () => ({status: false});
  assert.equal((await h.manager.batchAddPasswordLabels([1], [7])).status, false);
  assert.deepEqual(clone(h.ps.allPasswordArray[0].labels), []); assert.deepEqual(clone(h.manager.storeData), before);
});

test('reusing a manager for a different account waits for old writes before changing adapters', async t => {
  const h = harness(t), pending = deferred();
  h.addTree();
  const original = h.database.setStoreData; let newAccountWrites = 0;
  h.database.setStoreData = async text => {await pending.promise; return original(text);};
  const saved = h.manager.updatePassword({...h.password(), title: 'old account edit'});
  const newStore = JSON.stringify({...h.manager.storeData, passwordData: h.security.encryptAES('other-account-key',
    JSON.stringify(h.compression.compressArray([{...h.password(99), title: 'other account'}]))),
    labelData: h.security.encryptAES('other-account-key', '[]')});
  const nextDatabase = {getStoreData: async () => newStore, getTreeNoteData: async () => '', getSettingData: async () => '',
    setStoreData: async () => {newAccountWrites++; return {status: true};}};
  const login = h.manager.login(nextDatabase); await tick();
  assert.equal(h.manager.databaseClient, h.database);
  pending.resolve(); await saved; await login;
  assert.equal(newAccountWrites, 0); assert.equal(h.manager.databaseClient, nextDatabase);
  assert.equal(h.manager.unlock('other-account-key'), true); assert.equal(h.ps.allPasswordArray[0].id, 99);
  assert.equal(h.ns.noteData.noteTree.length, 0);
});
