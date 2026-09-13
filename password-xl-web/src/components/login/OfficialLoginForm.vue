<script setup lang="ts">
import { useLoginStore } from '@/stores/LoginStore'
import { useRouter, useRoute } from 'vue-router'
import { clearOfficial, officialOrigin } from '@/service/OfficialSession'
const loginStore = useLoginStore(), router = useRouter(), route = useRoute()
const error = ref(''), busy = ref(false)
async function connect() {
  busy.value = true
  error.value = ''
  try { if (await loginStore.loginOfficial()) await router.replace('/') }
  catch (e: any) {
    if (e.status === 401) { window.location.assign(officialOrigin); return }
    error.value = e.message || '连接官方存储失败，请重试'
  } finally { busy.value = false }
}
onMounted(() => {
  if (route.query.logout === '1') { clearOfficial(); router.replace('/login'); return }
  connect()
})
</script>
<template><div v-loading="busy" style="padding:24px"><h3>官方存储</h3><p>连接账号后，使用原有主密码解锁密码库。</p><el-alert v-if="error" :title="error" type="error" :closable="false" style="margin-bottom:16px"/><el-button type="primary" @click="connect">连接官方存储</el-button><el-link :href="officialOrigin" style="margin-top:18px;display:block">前往账号中心</el-link></div></template>
