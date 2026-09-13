<script setup lang="ts">
import { officialOrigin, officialState } from '@/service/OfficialSession'
const q = computed(() => officialState.info?.quota)
const size = (n: number) => (n / 1048576).toFixed(2) + ' MiB'
</script>
<template><div v-if="q" style="padding:6px 14px;font-size:12px"><el-link :href="officialOrigin" target="_blank">官方空间：{{ size(q.usedBytes) }} / {{ size(q.quotaBytes) }}</el-link><el-alert v-if="q.status !== 'NORMAL'" style="margin-top:6px" :closable="false" :type="q.status === 'BLOCKED' ? 'error' : 'warning'" :title="q.status === 'BLOCKED' ? '存储空间异常，请联系作者恢复' : q.status === 'FULL' ? '空间已达额度，新增与修改已暂停，请删除密码并清空回收站' : '空间使用已达60%，建议删除不需要的密码并清空回收站'"/></div></template>
