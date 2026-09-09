import type {BackgroundMode} from '@/types'

// 新配置优先；旧版只有显示开关，缺省时继续使用动态背景。
export const resolveBackgroundMode = (mode: unknown, legacyEnabled?: unknown): BackgroundMode => {
  if (mode === 'off' || mode === 'static' || mode === 'dynamic') return mode
  return legacyEnabled === false || legacyEnabled === 'false' ? 'off' : 'dynamic'
}
