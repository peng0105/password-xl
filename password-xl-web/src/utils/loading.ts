import { nextTick } from 'vue'
import { ElLoading } from 'element-plus'

export const waitForPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

// nextTick 只保证 DOM 已更新；同步解密前还需让浏览器实际绘制遮罩。
export const withLoading = async <T>(operation: () => T | Promise<T>): Promise<T> => {
  const loading = ElLoading.service({
    fullscreen: true,
    lock: true,
    text: '加载中...',
    customClass: 'password-operation-loading',
  })
  try {
    await nextTick()
    await waitForPaint()
    return await operation()
  } finally {
    // 保持遮罩直到解锁后的页面更新完成，再交给页面自身的加载状态。
    await nextTick()
    await waitForPaint()
    loading.close()
  }
}
