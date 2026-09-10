import {spawn, execFileSync} from 'node:child_process'
import {readdirSync, readFileSync, mkdtempSync, rmSync} from 'node:fs'
import {join, resolve, sep} from 'node:path'
import {tmpdir} from 'node:os'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'

const require = createRequire(new URL('../../password-xl-web/package.json', import.meta.url))
const asar = require('@electron/asar')

const [directory, version] = process.argv.slice(2)
const entries = readdirSync(directory)
let executable
let appArchive
if (process.platform === 'darwin') {
  const parent = join(directory, entries.find(name => name === 'mac-universal'))
  const app = readdirSync(parent).find(name => name.endsWith('.app'))
  executable = join(parent, app, 'Contents/MacOS/password-xl')
  appArchive = join(parent, app, 'Contents/Resources/app.asar')
  const archs = execFileSync('lipo', ['-archs', executable], {encoding: 'utf8'})
  assert(archs.includes('x86_64') && archs.includes('arm64'), 'DMG app is not universal')
  execFileSync('codesign', ['--verify', '--deep', '--strict', join(parent, app)])
} else if (process.platform === 'win32') {
  executable = join(directory, 'win-unpacked/password-xl.exe')
  appArchive = join(directory, 'win-unpacked/resources/app.asar')
  const pe = readFileSync(executable)
  assert.equal(pe.readUInt16LE(pe.readUInt32LE(0x3c) + 4), 0x8664, 'Windows app is not x64')
} else {
  executable = join(directory, 'linux-unpacked/password-xl')
  appArchive = join(directory, 'linux-unpacked/resources/app.asar')
  const elf = readFileSync(executable)
  assert.equal(elf.readUInt16LE(18), 62, 'Linux app is not x64')
}
assert.equal(JSON.parse(asar.extractFile(appArchive, 'package.json')).version, version, 'Packaged app version mismatch')
const packagedPaths = asar.listPackage(appArchive).map(name => name.replaceAll('\\', '/'))
assert(packagedPaths.includes('/node_modules/crypto-js/index.js'), 'Electron runtime dependency missing')
assert(!packagedPaths.some(name => /\/node_modules\/(?:@rolldown|vite|typescript)\//.test(name)),
  'Frontend build tools must not be shipped in the app')
for (const name of entries) {
  const artifact = join(directory, name)
  if (name.endsWith('.rpm')) {
    const metadata = execFileSync('rpm', ['-qp', '--queryformat', '%{VERSION} %{ARCH}', artifact], {encoding: 'utf8'})
    assert.equal(metadata, `${version} x86_64`)
  } else if (name.endsWith('.snap')) {
    const metadata = execFileSync('unsquashfs', ['-cat', artifact, 'meta/snap.yaml'], {encoding: 'utf8'})
    assert(metadata.includes(version) && metadata.includes('amd64') && metadata.includes('core22'))
  } else if (name.endsWith('.AppImage')) {
    const bytes = readFileSync(artifact)
    assert.equal(bytes.readUInt16LE(18), 62)
    assert.equal(bytes.subarray(8, 10).toString(), 'AI')
  } else if (name.endsWith('.dmg')) {
    execFileSync('hdiutil', ['verify', artifact], {stdio: 'inherit'})
  } else if (name.endsWith('.exe')) {
    assert.equal(readFileSync(artifact).subarray(0, 2).toString(), 'MZ')
  }
}
const data = mkdtempSync(join(tmpdir(), 'password-xl-desktop-test-'))
const port = 19000 + Math.floor(Math.random() * 10000)
const command = process.platform === 'linux' ? 'xvfb-run' : executable
const args = [...(process.platform === 'linux' ? ['-a', executable] : []),
  ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
  `--remote-debugging-port=${port}`, `--user-data-dir=${data}`]
const child = spawn(command, args, {stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32',
  env: {...process.env, APPDATA: data, XDG_CONFIG_HOME: data}})
let socket
try {
  let pages
  for (let attempt = 0; attempt < 90; attempt++) {
    if (child.exitCode !== null) throw new Error(`Electron exited early: ${child.exitCode}`)
    try {
      pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      if (pages.some(page => page.type === 'page' && page.url.startsWith('file:'))) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const page = pages?.find(page => page.type === 'page' && page.url.startsWith('file:'))
  assert(page, 'Packaged frontend did not open')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const command = (method, params) => new Promise((resolve, reject) => {
    const current = ++id
    const timer = setTimeout(() => reject(new Error('Electron evaluation timed out')), 15000)
    const listener = event => {
      const message = JSON.parse(event.data)
      if (message.id !== current) return
      clearTimeout(timer)
      socket.removeEventListener('message', listener)
      if (message.error || message.result?.exceptionDetails) reject(new Error('Packaged frontend evaluation failed'))
      else resolve(message.result)
    }
    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({id: current, method, params}))
  })
  const evaluate = async expression => (await command('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})).result.value
  let ready = false
  for (let attempt = 0; attempt < 30; attempt++) {
    ready = await evaluate("Boolean(document.querySelector('#app')?.children.length && window.electronAPI?.getFile)")
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert(ready, 'Vue frontend or Electron bridge did not initialize')
  assert(await evaluate("location.pathname.endsWith('/index.html') && location.hash.startsWith('#/')"),
    'Bundled routing must preserve the local entry path')
  await evaluate('window.__ciBeforeReload = true')
  await command('Page.reload', {ignoreCache: true})
  ready = false
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      ready = await evaluate("!window.__ciBeforeReload && Boolean(document.querySelector('#app')?.children.length && window.electronAPI?.getFile)")
      if (ready) break
    } catch {} // Reload destroys the old JavaScript execution context.
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert(ready, 'Packaged frontend failed to reload at its local route')
  const result = await evaluate(`(async () => {
    const name = 'ci-smoke.json';
    await window.electronAPI.uploadFile(name, 'ci-test');
    const value = await window.electronAPI.getFile(name);
    await window.electronAPI.deleteFile(name);
    return value;
  })()`)
  assert.equal(result, 'ci-test', 'Packaged IPC storage round trip failed')
  console.log(`Desktop ${version}: architecture, page startup/reload and isolated IPC storage passed`)
} finally {
  socket?.close()
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {stdio: 'ignore'}) } catch {}
  } else {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
  }
  await new Promise(resolve => setTimeout(resolve, 2000))
  assert(resolve(data).startsWith(resolve(tmpdir()) + sep + 'password-xl-desktop-test-'))
  rmSync(data, {recursive: true, force: true, maxRetries: 5})
}
