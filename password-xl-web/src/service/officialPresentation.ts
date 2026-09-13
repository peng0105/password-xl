export const warningThreshold = 0.8
export function quotaStatus(used: number, quota: number): string {
  return used >= quota * 2
    ? 'BLOCKED'
    : used >= quota
      ? 'FULL'
      : used >= quota * warningThreshold
        ? 'WARNING'
        : 'NORMAL'
}
export function quotaNotice(
  info: {
    usageKnown?: boolean
    quota: { usedBytes: number; quotaBytes: number; checkFailed?: boolean }
  } | null,
) {
  if (
    !info ||
    info.usageKnown === false ||
    info.quota.checkFailed ||
    info.quota.quotaBytes <= 0
  )
    return null
  const ratio = info.quota.usedBytes / info.quota.quotaBytes
  if (ratio < warningThreshold) return null
  return ratio >= 2
    ? {
        type: 'error' as const,
        title: '官方存储暂不可用',
        message: '空间用量已达到额度的两倍，请联系作者恢复。',
      }
    : ratio >= 1
      ? {
          type: 'error' as const,
          title: '官方空间已满',
          message: '新增与修改已暂停，请删除不需要的密码并清空回收站。',
        }
      : {
          type: 'warning' as const,
          title: '官方空间即将用满',
          message: '空间使用已达到 80%，建议删除不需要的密码并清空回收站。',
        }
}
export const officialBytes = (bytes: number) =>
  bytes < 1048576
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / 1048576).toFixed(2)} MiB`
export const officialDate = (date?: string | null) =>
  date
    ? new Date(date).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
      })
    : '—'
