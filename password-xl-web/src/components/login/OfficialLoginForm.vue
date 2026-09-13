<script setup lang="ts">
import {useLoginStore} from '@/stores/LoginStore'
import {useRouter, useRoute} from 'vue-router'
import {beginOfficialLogin, clearOfficial, officialApi, officialOrigin, type OfficialInfo} from '@/service/OfficialSession'

const loginStore = useLoginStore(), router = useRouter(), route = useRoute()
const profile = ref<OfficialInfo | null>(null)
const busy = ref(true), error = ref(''), needsLogin = ref(false)
let mounted = true
const identity = computed(() => profile.value?.loginIdentity?.value || profile.value?.user.email || profile.value?.user.displayName || '')
const identityLabel = computed(() => ({email: '邮箱', github: 'GitHub', phone: '手机号', sms: '手机号'}[profile.value?.loginIdentity?.provider || ''] || '账号'))

function failed(e: any) {
  needsLogin.value = e.status === 401
  error.value = needsLogin.value ? '登录已失效，请重新登录' : e.message || '连接失败，请重试'
}
async function loadProfile() {
  busy.value = true
  error.value = ''
  try {
    const info = await officialApi('/session/me', {}, 'GET')
    if (!mounted) return
    profile.value = info
    needsLogin.value = false
    sessionStorage.removeItem('official-login-redirect')
  } catch (e: any) {
    if (!mounted) return
    failed(e)
    const lastRedirect = Number(sessionStorage.getItem('official-login-redirect') || 0)
    if (needsLogin.value && Date.now() - lastRedirect > 60000) beginOfficialLogin()
  } finally { if (mounted) busy.value = false }
}
async function enter() {
  if (busy.value) return
  if (needsLogin.value) { beginOfficialLogin(); return }
  if (!profile.value) { await loadProfile(); return }
  busy.value = true
  error.value = ''
  try {
    if (await loginStore.loginOfficial()) await router.replace('/')
    else error.value = '密码库未能打开，请重试'
  } catch (e: any) { if (mounted) failed(e) }
  finally { if (mounted) busy.value = false }
}
onMounted(() => {
  if (route.query.logout === '1') { clearOfficial(false); void router.replace('/login'); return }
  void loadProfile()
})
onUnmounted(() => { mounted = false })
</script>

<template>
  <section class="official-form" aria-label="官方存储" :aria-busy="busy">
    <el-text class="official-title">官方存储</el-text>
    <div v-if="profile" class="official-identity">
      <div class="identity-heading"><el-text type="info" size="small">{{ identityLabel }}</el-text><el-tag type="success" size="small">已登录</el-tag></div>
      <el-text class="identity-value">{{ identity }}</el-text>
      <el-text v-if="profile.user.publicId" class="identity-id" type="info" size="small">用户 ID：{{ profile.user.publicId }}</el-text>
    </div>
    <el-skeleton v-else-if="busy" :rows="2" animated class="identity-loading" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" class="connection-error" />
    <el-button class="login-btn" plain round type="primary" :loading="busy" @click="enter">{{ needsLogin ? '重新登录' : !profile && !busy ? '重试' : '进入' }}</el-button>
    <div class="account-link"><el-link :href="officialOrigin" type="primary" underline="hover">账号中心</el-link></div>
  </section>
</template>

<style scoped>
.official-form { width: 83.333%; margin: 30px auto 0; }
.official-title { display: block; font-size: 24px; text-align: center; }
.official-identity { margin: 32px 0; padding: 18px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-fill-color-blank); }
.identity-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.identity-value { display: block; overflow-wrap: anywhere; font-size: 16px; line-height: 1.6; }
.identity-id { display: block; margin-top: 10px; overflow-wrap: anywhere; }
.identity-loading { margin: 32px 0; }
.connection-error { margin-bottom: 20px; }
.login-btn { width: 100%; margin: 0 auto 15px; }
.account-link { text-align: right; }
</style>
