<script setup lang="ts">
import {useLoginStore} from '@/stores/LoginStore'
import {useRouter, useRoute} from 'vue-router'
import {clearOfficial, officialOrigin, officialState} from '@/service/OfficialSession'
import logo from '@/assets/images/logo.svg'
import wheat from '@/assets/images/login/login.png'
const loginStore = useLoginStore(), router = useRouter(), route = useRoute()
const busy = ref(true), error = ref(''), needsLogin = ref(false)
let requesting = false
const profile = computed(() => officialState.info)
const preparing = computed(() => profile.value?.storageStatus === 'NOT_CONFIGURED')
const title = computed(() => busy.value ? '正在连接你的密码库' : needsLogin.value ? '登录官方账号，继续使用' : preparing.value ? '官方存储正在准备中' : '暂时未能连接密码库')
const description = computed(() => busy.value ? '正在确认账号与存储状态，请稍候。' : needsLogin.value ? '前往账号站验证邮箱，登录后会自动回到这里。' : preparing.value ? '账号已经验证。存储服务开通后，重新检查即可继续，无需重新注册。' : error.value)
const action = computed(() => busy.value ? '正在连接…' : needsLogin.value ? '登录官方账号' : preparing.value ? '重新检查' : '重新连接')
async function connect() {
  if (requesting) return
  requesting = true
  busy.value = true
  error.value = ''
  needsLogin.value = false
  try {
    if (await loginStore.loginOfficial()) { await router.replace('/'); return }
    error.value = '密码库未能完成初始化，请重试。'
  } catch (e: any) {
    needsLogin.value = e.status === 401
    const message = typeof e.message === 'string' ? e.message : e.message?.message
    error.value = message && !/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(message) ? message : '无法连接存储服务，请检查网络后重试。'
  } finally { busy.value = false; requesting = false }
}
function proceed() { if (needsLogin.value) window.location.assign(officialOrigin); else void connect() }
function back() { clearOfficial(false); router.replace('/login') }
onMounted(() => {
  if (route.query.logout === '1') { back(); return }
  if (profile.value?.error) { error.value = profile.value.storageMessage || '暂时无法连接存储，请重试'; busy.value = false; return }
  void connect()
})
</script>

<template>
  <main class="official-page">
    <header class="official-header">
      <router-link to="/login" class="official-brand"><img :src="logo" alt=""><span>password<span>-XL</span></span></router-link>
      <button class="quiet-link" @click="back">← 其他存储方式</button>
    </header>
    <section class="official-card">
      <div class="official-photo">
        <img :src="wheat" alt="阳光下的金色麦田"><div class="photo-shade" />
        <div class="photo-copy"><span>熟悉的密码库，更轻松的连接</span><h1>你的密码，<br>始终在身边。</h1><p>官方账号负责连接。<br>主密码，依然只属于你。</p></div>
      </div>
      <div class="official-content" aria-live="polite" :aria-busy="busy">
        <div class="official-eyebrow"><span class="blue-dot" /> 官方存储</div>
        <div class="connection-symbol" :class="{busy}"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M9 24H7a5 5 0 0 1-.7-9.95A9 9 0 0 1 24 12a6 6 0 0 1 1 12h-2M16 15v13m-4-4 4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></div>
        <h2>{{ title }}</h2><p class="connection-description">{{ description }}</p>
        <div v-if="profile && !busy && !needsLogin" class="identity-chip"><span class="identity-avatar">{{ (profile.user.displayName || profile.user.email || 'P').slice(0, 1).toUpperCase() }}</span><div><small>已登录官方账号</small><strong>{{ profile.user.displayName || profile.user.email || 'password-XL 用户' }}</strong></div><span class="identity-check">✓</span></div>
        <ol class="connection-steps">
          <li :class="{done: profile && !needsLogin}"><span>{{ profile && !needsLogin ? '✓' : '1' }}</span><div><strong>验证账号</strong><small>邮箱验证码登录</small></div></li>
          <li :class="{current: profile && !needsLogin}"><span>2</span><div><strong>连接存储</strong><small>{{ preparing ? '等待服务开通' : '确认密码库状态' }}</small></div></li>
          <li><span>3</span><div><strong>解锁密码库</strong><small>在本机输入主密码</small></div></li>
        </ol>
        <el-button class="connect-button" type="primary" :loading="busy" :disabled="busy" @click="proceed">{{ action }}<span v-if="!busy" class="button-arrow">→</span></el-button>
        <div class="connection-links"><a :href="officialOrigin">管理官方账号 ↗</a><button class="quiet-link" @click="back">使用其他存储</button></div>
        <p class="connection-footnote">切换存储不会迁移或删除你原来的 OSS 密码库。<span v-if="profile?.contact && !needsLogin">{{ profile.contact }}</span></p>
      </div>
    </section>
    <p class="official-caption">账号登录与主密码解锁相互独立</p><ICPRecord />
  </main>
</template>

<style scoped>
.official-page{min-height:100svh;background:#f5f8fc;color:#21394e;padding:32px 40px 64px;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;box-sizing:border-box}
.official-header{max-width:1080px;margin:0 auto 38px;display:flex;align-items:center;justify-content:space-between;gap:20px}.official-brand{display:flex;gap:11px;align-items:center;text-decoration:none;color:#21394e;font-size:23px;font-weight:700;letter-spacing:-.5px}.official-brand img{width:36px;height:36px}.official-brand>span>span{color:#087bb9}.quiet-link{border:0;background:none;padding:0;font:inherit;color:#708397;cursor:pointer;font-size:13px;text-decoration:none}.quiet-link:hover{color:#087bb9}
.official-card{max-width:1080px;margin:auto;background:#fff;border:1px solid #e0e9f1;border-radius:22px;display:grid;grid-template-columns:.92fr 1.08fr;overflow:hidden;box-shadow:0 18px 60px #21394e0a}.official-photo{position:relative;min-height:570px;overflow:hidden}.official-photo>img{width:100%;height:100%;position:absolute;object-fit:cover;object-position:center}.photo-shade{position:absolute;inset:0;background:linear-gradient(180deg,#29321300 20%,#1e2c30ae)}.photo-copy{position:absolute;inset:auto 38px 43px;color:#fff}.photo-copy>span{font-size:12px;letter-spacing:1px;color:#fffdf0}.photo-copy h1{font-size:38px;line-height:1.4;letter-spacing:-1px;font-weight:650;margin:17px 0}.photo-copy p{font-size:14px;line-height:1.85;margin:0;color:#fffdf0}
.official-content{padding:36px 42px;min-width:0}.official-eyebrow{display:flex;align-items:center;gap:8px;font-size:12px;color:#658198}.blue-dot{width:7px;height:7px;background:#49c3ff;border-radius:50%}.connection-symbol{width:58px;height:58px;border-radius:17px;background:#edf8ff;color:#188aca;display:grid;place-items:center;margin:26px 0 20px;border:1px solid #d8eefb}.connection-symbol svg{width:31px;height:31px}.connection-symbol.busy{animation:breathe 1.5s ease-in-out infinite}.official-content h2{font-size:25px;line-height:1.4;margin:0 0 12px;font-weight:650;letter-spacing:-.4px}.connection-description{font-size:14px;line-height:1.8;color:#718295;margin:0;min-height:50px}
.identity-chip{display:flex;gap:11px;align-items:center;padding:12px 14px;background:#f6f9fc;border-radius:10px;margin:17px 0 0}.identity-avatar{width:34px;height:34px;background:#e4f2ff;color:#2483ba;display:grid;place-items:center;border-radius:50%;font-size:13px;flex:none}.identity-chip div{display:grid;gap:4px;min-width:0}.identity-chip small{color:#8391a0;font-size:10px}.identity-chip strong{font-size:13px;overflow-wrap:anywhere;font-weight:500}.identity-check{margin-left:auto;color:#379777}
.connection-steps{list-style:none;display:flex;gap:10px;padding:0;margin:24px 0 27px}.connection-steps li{display:flex;gap:8px;flex:1;min-width:0}.connection-steps li>span{width:20px;height:20px;display:grid;place-items:center;border-radius:50%;background:#f0f3f7;color:#98a6b3;font-size:10px;flex:none}.connection-steps li.done>span{background:#e6f6ef;color:#278869}.connection-steps li.current>span{background:#e6f4fe;color:#1385c6}.connection-steps strong,.connection-steps small{display:block;font-size:11px;line-height:1.8;font-weight:400}.connection-steps strong{color:#597185}.connection-steps small{color:#98a6b3;font-size:10px}
.connect-button{width:100%;height:46px;border-radius:9px;background:#087bb9;border-color:#087bb9;font-size:14px}.button-arrow{margin-left:12px}.connection-links{display:flex;justify-content:space-between;gap:15px;margin-top:18px;font-size:12px}.connection-links a{color:#448bb7;text-decoration:none}.connection-links .quiet-link{font-size:12px}.connection-footnote{font-size:11px;color:#94a2ae;line-height:1.9;margin:26px 0 0;border-top:1px solid #edf1f5;padding-top:16px}.connection-footnote span{display:block}.official-caption{text-align:center;color:#98a6b4;font-size:12px;margin:26px 0 0}@keyframes breathe{50%{opacity:.5}}
@media(min-width:1600px){.official-header{margin-bottom:54px}.official-page{padding-top:46px}}@media(max-width:800px){.official-page{padding:22px 22px 64px}.official-header{margin-bottom:24px}.official-brand{font-size:20px}.official-card{grid-template-columns:.7fr 1fr}.official-content{padding:30px}.photo-copy{left:24px;right:20px}.photo-copy h1{font-size:30px}.connection-steps{gap:5px}.connection-steps li{gap:5px}}
@media(max-width:600px){.official-page{padding:20px 16px 70px}.official-header{margin-bottom:20px}.official-header>.quiet-link{font-size:11px}.official-card{grid-template-columns:1fr;border-radius:16px}.official-photo{min-height:168px;max-height:168px}.official-photo>img{object-position:center 44%}.photo-copy{inset:20px 24px auto}.photo-copy>span,.photo-copy p{display:none}.photo-copy h1{font-size:26px;line-height:1.45;margin:0}.photo-shade{background:linear-gradient(90deg,#25312b88,#29321300)}.official-content{padding:25px}.connection-symbol{margin:20px 0 17px;width:48px;height:48px}.official-content h2{font-size:22px}.connection-description{font-size:13px;min-height:0}.connection-steps{margin:23px 0}.official-caption{font-size:11px}.identity-chip{padding:10px}.connection-footnote{margin-top:22px}}@media(prefers-reduced-motion:reduce){.connection-symbol.busy{animation:none}}
</style>
<style scoped>
.official-page :deep(.icp-text) { position: static; width: auto; margin-top: 20px; }
.official-page :deep(.icp-text .el-link) { font-size: 11px; }
.connection-footnote { color: #74899b; }
.connection-steps small { color: #7a8e9f; }
@media(max-width:600px) {
  .connection-steps li { flex-direction: column; gap: 6px; }
  .connection-steps small { font-size: 10px; }
  .official-page { padding-bottom: 28px; }
}
</style>
