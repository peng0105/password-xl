import { reactive } from 'vue'

export interface OfficialQuota { quotaBytes: number; usedBytes: number; storeBytes: number; settingBytes: number; status: string; checkedAt: string | null; quotaUntil?: string | null; checkFailed?: boolean }
export interface OfficialFileGrant { uploadUrl: string; fields: Record<string, string>; getUrl: string; headUrl: string; maxBytes: number }
export interface OfficialGrant { userId: string; vaultId: string; quotaBytes: number; expiresAt: string; files: Record<string, OfficialFileGrant> }
export interface OfficialInfo { user: { id: string; publicId?: string; displayName?: string; email?: string; createdAt?: string }; loginIdentity?: {provider: string; value: string}; quota: OfficialQuota; grant?: OfficialGrant; error?: string; contact: string; storageDisabled: boolean; storageStatus?: string; storageMessage?: string; usageKnown?: boolean }
export const officialOrigin = (import.meta.env.VITE_OFFICIAL_ACCOUNT_ORIGIN || 'https://account.password-xl.cn').replace(/\/$/, '')
export const officialState = reactive<{ info: OfficialInfo | null; epoch: number; initialization: number; usageDirty: boolean }>({ info: null, epoch: 0, initialization: 0, usageDirty: false })
let refresh: Promise<OfficialInfo> | null = null
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('password-xl-official') : null

export async function officialApi(path: string, data: unknown = {}): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    const response = await fetch(officialOrigin + '/api/v1' + path, { method: 'POST', credentials: 'include', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-PXL-CSRF': 'password-xl' }, body: JSON.stringify(data) })
    const body = await response.json().catch(() => null)
    if (!body || typeof body.code !== 'number') throw Object.assign(new Error('账号服务暂时无法连接，请稍后重试'), {status: response.status, code: 'SERVICE_UNAVAILABLE'})
    if (!response.ok || body.code !== 0) throw Object.assign(new Error(body.message || '官方存储服务不可用'), { status: response.status, code: body.data?.error })
    return body.data
  } catch (error: any) {
    if (error?.code || error?.status) throw error
    throw Object.assign(new Error(error?.name === 'AbortError' ? '连接超时，请检查网络后重试' : '无法连接账号服务，请检查网络后重试'), {code: 'NETWORK_ERROR'})
  } finally { clearTimeout(timer) }
}

export function officialStorageKey(key: string): string {
  const id = officialState.info?.user.id
  return id ? `${key}:official:${id}` : key
}

export async function restoreOfficial(initial = false): Promise<OfficialInfo> {
  if (refresh) return refresh
  const epoch = officialState.epoch
  const pending = (async () => {
    const info: OfficialInfo = await officialApi(initial ? '/session/bootstrap' : '/storage/grants')
    if (epoch !== officialState.epoch) throw new Error('账号已切换，请重新连接')
    const oldId = officialState.info?.user.id
    if (oldId && oldId !== info.user.id) {
      clearOfficial(false)
      window.dispatchEvent(new Event('official-account-changed'))
      throw new Error('官方账号已切换，请重新登录密码库')
    }
    officialState.info = info
    officialState.usageDirty = false
    if (initial) officialState.initialization++
    localStorage.setItem('official-user', info.user.id)
    localStorage.setItem('official-selected', 'true')
    channel?.postMessage({ type: 'identity', id: info.user.id })
    if (info.error || !info.grant) throw Object.assign(new Error(info.storageMessage || (info.error === 'QUOTA_BLOCKED' ? '存储空间异常，请联系作者恢复' : '暂时无法连接官方存储，请稍后重试')), { code: info.error || 'STORAGE_UNAVAILABLE' })
    return info
  })().catch(error => {
    if (initial && error.status === 401 && epoch === officialState.epoch) officialState.info = null
    throw error
  }).finally(() => { if (refresh === pending) refresh = null })
  refresh = pending
  return pending
}

export async function currentOfficialGrant(): Promise<OfficialGrant> {
  let info = officialState.info
  if (!info?.grant || new Date(info.grant.expiresAt).getTime() <= Date.now() + 30000) info = await restoreOfficial()
  if (!info.grant) throw new Error('官方存储不可用')
  return info.grant
}

export function clearOfficial(broadcast = true): void {
  const id = officialState.info?.user.id || localStorage.getItem('official-user')
  officialState.epoch++
  refresh = null
  officialState.info = null
  localStorage.removeItem('official-selected')
  if (id) for (const key of ['loginInfo', 'mainPassword']) localStorage.removeItem(`${key}:official:${id}`)
  localStorage.removeItem('official-user')
  if (broadcast) channel?.postMessage({ type: 'logout' })
}

channel?.addEventListener('message', event => {
  if (!officialState.info) return
  if (event.data?.type === 'logout' || (event.data?.type === 'identity' && event.data.id !== officialState.info.user.id)) {
    clearOfficial(false)
    window.dispatchEvent(new Event('official-account-changed'))
  }
})
