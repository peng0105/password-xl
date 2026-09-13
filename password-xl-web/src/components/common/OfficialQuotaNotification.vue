<script setup lang="ts">
import { h, watch, onUnmounted } from 'vue'
import { ElNotification, ElButton } from 'element-plus'
import { officialState, officialOrigin } from '@/service/OfficialSession'
import { quotaNotice } from '@/service/officialPresentation'
import { useRefStore } from '@/stores/RefStore'
const refs = useRefStore(),
  notified = new Set<string>()
let close: (() => void) | undefined
watch(
  () => officialState.initialization,
  () => {
    const info = officialState.info
    if (
      !info ||
      info.usageKnown === false ||
      info.quota.checkFailed ||
      notified.has(info.user.id)
    )
      return
    notified.add(info.user.id)
    const notice = quotaNotice(info)
    if (!notice) return
    close = ElNotification({
      ...notice,
      position: 'top-right',
      duration: 8000,
      showClose: true,
      message: h('div', [
        h('p', { style: 'margin:0 0 8px' }, notice.message),
        h(
          ElButton,
          {
            link: true,
            type: 'primary',
            onClick: () => {
              if (refs.settingRef?.openSetting)
                refs.settingRef.openSetting('loginInfo')
              else window.open(officialOrigin, '_blank', 'noopener')
              close?.()
            },
          },
          () => '查看空间',
        ),
      ]),
    }).close
  },
)
watch(
  () => officialState.info?.user.id,
  (id, old) => {
    if (old && old !== id) close?.()
  },
)
onUnmounted(() => close?.())
</script>
<template></template>
