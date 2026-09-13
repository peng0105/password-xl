import {quotaStatus} from '@/service/officialPresentation.ts'
import type { Database, Password, RespData } from '@/types'
import { PasswordStatus } from '@/types'
import { currentOfficialGrant, officialApi, officialState, restoreOfficial } from '@/service/OfficialSession'

export class DatabaseForOfficial implements Database {
  private versions: Record<string, string | null> = {}
  private epoch = -1
  private userId = ''
  private cleared = false
  private cleanupChange = false
  async login(): Promise<RespData> {
    const info = await restoreOfficial(true)
    this.epoch = officialState.epoch
    this.userId = info.user.id
    return { status: true }
  }
  private assertSession() {
    if (this.epoch !== officialState.epoch || this.userId !== officialState.info?.user.id) throw new Error('官方账号已变化，请重新登录')
  }
  assertCanModify() {
    this.assertSession()
    const q = officialState.info!.quota
    if (q.usedBytes >= q.quotaBytes) throw new Error('官方空间已达到额度，请删除密码并清空回收站后再修改')
  }
  validateStoreChange(previous: Password[], next: Password[], labelsChanged: boolean) {
    this.assertSession()
    const old = new Map(previous.map(p => [p.id, p]))
    // Only removal or moving unchanged records into the recycle bin counts as cleanup.
    this.cleanupChange = !labelsChanged && next.every(p => {
      const before = old.get(p.id)
      if (!before) return false
      if (JSON.stringify(before) === JSON.stringify(p)) return true
      return p.status === PasswordStatus.DELETED && before.status !== PasswordStatus.DELETED &&
        JSON.stringify({ ...p, status: before.status, deleteTime: before.deleteTime }) === JSON.stringify(before)
    })
    if (!this.cleanupChange) this.assertCanModify()
  }
  private async request(name: string, method: 'GET' | 'HEAD'): Promise<Response> {
    this.assertSession()
    for (let attempt = 0; attempt < 2; attempt++) {
      const grant = await currentOfficialGrant()
      this.assertSession()
      const file = grant.files[name]
      if (!file) throw new Error('不支持的官方存储文件')
      const response = await fetch(method === 'GET' ? file.getUrl : file.headUrl, { method, cache: 'no-store', credentials: 'omit' })
      this.assertSession()
      if (response.status === 403 && attempt === 0) { await restoreOfficial(); continue }
      if (!response.ok && response.status !== 404) throw new Error('官方文件读取失败，请检查连接后重试')
      return response
    }
    throw new Error('官方授权无效，请重新连接')
  }
  private async read(name: string) {
    const response = await this.request(name, 'GET')
    this.versions[name] = response.status === 404 ? null : response.headers.get('etag') || 'unknown'
    const content = response.status === 404 ? '' : await response.text()
    this.assertSession()
    return content
  }
  private async write(name: string, text: string): Promise<RespData> {
    this.assertSession()
    const allowCleanup = name === 'store.json' && this.cleanupChange
    this.cleanupChange = false
    const blob = new Blob([text], { type: 'application/octet-stream' })
    for (let attempt = 0; attempt < 2; attempt++) {
      const grant = await currentOfficialGrant()
      this.assertSession()
      const file = grant.files[name]
      if (!file) throw new Error('官方存储仅支持密码库和设置文件')
      const q = officialState.info!.quota
      const oldSize = name === 'store.json' ? q.storeBytes : q.settingBytes
      const nextSize = q.usedBytes - oldSize + blob.size
      if (blob.size > file.maxBytes || (!allowCleanup && nextSize > q.quotaBytes && blob.size > oldSize)) throw new Error('保存后将超过官方空间额度，请先清空回收站')
      const head = await this.request(name, 'HEAD')
      const actual = head.status === 404 ? null : head.headers.get('etag')
      if (!(name in this.versions) || actual !== this.versions[name] || actual === 'unknown') throw new Error('密码文件已被其他客户端更新，请刷新后再操作')
      const form = new FormData()
      Object.entries(file.fields).forEach(([k, v]) => form.append(k, v))
      form.append('file', blob, name)
      let response: Response
      try { response = await fetch(file.uploadUrl, { method: 'POST', body: form, credentials: 'omit' }) }
      catch {
        // A lost response may follow a successful write; never blindly repeat the overwrite.
        const current = await this.read(name)
        if (current !== text) throw new Error('无法确认保存结果，请保留当前内容并重新连接')
        this.updateSize(name, blob.size)
        return { status: true }
      }
      this.assertSession()
      if (response.status === 403 && attempt === 0) { await restoreOfficial(); continue }
      if (!response.ok) throw new Error('官方文件上传失败，修改未确认保存')
      this.versions[name] = response.headers.get('etag') || 'unknown'
      // A successful upload is not reported as failed solely because the follow-up HEAD fails.
      if (this.versions[name] === 'unknown') try { this.versions[name] = (await this.request(name, 'HEAD')).headers.get('etag') || 'unknown' } catch { /* next write remains blocked until re-read */ }
      this.updateSize(name, blob.size)
      return { status: true }
    }
    throw new Error('官方授权刷新失败，请重试')
  }
  private updateSize(name: string, size: number) {
    const q = officialState.info!.quota
    if (name === 'store.json') q.storeBytes = size; else q.settingBytes = size
    q.usedBytes = q.storeBytes + q.settingBytes
    q.status = quotaStatus(q.usedBytes, q.quotaBytes)
    officialState.usageDirty = true
  }
  getStoreData() { return this.read('store.json') }
  getSettingData() { return this.read('setting.json') }
  setStoreData(text: string) { return this.write('store.json', text) }
  setSettingData(text: string) { return this.write('setting.json', text) }
  async getTreeNoteData() { return '' }
  async setNoteData(): Promise<RespData> { throw new Error('官方存储不支持笔记') }
  async getData(): Promise<string> { throw new Error('官方存储不支持此文件') }
  async setData(): Promise<RespData> { throw new Error('官方存储不支持此文件') }
  async deleteData(): Promise<RespData> { throw new Error('官方存储不支持此文件') }
  async uploadImage(): Promise<any> { throw new Error('官方存储不支持图片') }
  async deleteStoreData(): Promise<RespData> { this.assertSession(); await officialApi('/storage/clear', { confirmation: 'CLEAR_VAULT' }); this.cleared = true; return { status: true } }
  async deleteSettingData(): Promise<RespData> { if (!this.cleared) throw new Error('请通过清空密码库操作删除设置'); return { status: true } }
}
