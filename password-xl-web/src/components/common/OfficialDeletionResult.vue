<script setup lang="ts">
import { officialApi } from '@/service/OfficialSession'
import { officialDate } from '@/service/officialPresentation'
const visible = ref(
    new URLSearchParams(location.search).get('accountDeleted') === '1',
  ),
  result = ref<any>(null),
  error = ref('')
const confirmed = computed(() =>
  ['CLEANING', 'COMPLETED'].includes(result.value?.status),
)
async function load() {
  error.value = ''
  try {
    const receipt = JSON.parse(
      sessionStorage.getItem('official-deletion-receipt') || 'null',
    )
    if (receipt)
      result.value = await officialApi('/account/deletion/result', receipt)
  } catch (e: any) {
    error.value = e.message
  }
}
onMounted(() => {
  if (visible.value) load()
})
</script>
<template>
  <el-dialog v-model="visible" title="注销处理结果" width="min(480px, 94vw)"
    ><el-result
      :icon="confirmed ? 'success' : 'info'"
      title="你已退出官方存储"
      :sub-title="
        confirmed
          ? '账号已停用，所有设备的官方账号会话已撤销。'
          : '当前设备已停止写入，请查询确认注销是否完成。'
      "
    />
    <p v-if="result?.status === 'COMPLETED'">云端数据清理已完成。</p>
    <p v-else-if="confirmed">
      最终清理不早于 {{ officialDate(result.cleanupAfter) }}，失败会自动重试。
    </p>
    <p v-else-if="result">注销尚未提交成功。可以重新连接官方账号后继续操作。</p>
    <el-alert
      v-if="error"
      type="warning"
      :title="error"
      :closable="false"
    /><template #footer
      ><el-button @click="load">查询清理结果</el-button
      ><el-button type="primary" @click="visible = false"
        >知道了</el-button
      ></template
    ></el-dialog
  >
</template>
