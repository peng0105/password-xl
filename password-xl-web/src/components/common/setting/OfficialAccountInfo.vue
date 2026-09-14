<script setup lang="ts">
import { officialOrigin, officialState } from '@/service/OfficialSession'
import { officialBytes, officialDate } from '@/service/officialPresentation'
import { estimateRemainingPasswords } from '@/service/officialCapacity'
import { copyText } from '@/utils/global'
import { usePasswordStore } from '@/stores/PasswordStore'
import { useRefStore } from '@/stores/RefStore'
import { ServiceStatus } from '@/types'
import logo from '@/assets/images/logo.svg'
const store = usePasswordStore()
const refs = useRefStore()
const info = computed(() => officialState.info),
  q = computed(() => info.value?.quota)
const ratio = computed(() =>
  q.value?.quotaBytes ? (q.value.usedBytes / q.value.quotaBytes) * 100 : 0,
)
const known = computed(() => !!q.value && info.value?.usageKnown !== false && !q.value.checkFailed)
const remainingPasswords = computed(() => estimateRemainingPasswords(store.allPasswordArray, info.value))
const color = computed(() =>
  ratio.value >= 100 ? '#e45d66' : ratio.value >= 80 ? '#d79728' : '#32b7f0',
)
const identity = computed(
  () =>
    info.value?.loginIdentity ||
    (info.value?.user.email
      ? { provider: 'email', value: info.value.user.email }
      : null),
)
const modes: Record<string, string> = {
  email: '邮箱验证码',
  github: 'GitHub',
  gitee: 'Gitee',
  wechat: '微信',
}
const userId = computed(() => info.value?.user.publicId || info.value?.user.id || '')
const accountCenter = () => window.open(officialOrigin, '_blank', 'noopener')
function initialize() {
  refs.settingRef.closeSetting()
  refs.setPasswordRef.setMainPassword()
}
</script>
<template>
  <section class="official-info" v-if="info && q">
    <header class="identity-heading">
      <img :src="logo" alt="password-XL" />
      <div>
        <div class="heading-title"><h2>官方存储</h2><el-tag type="success" effect="light" round size="small">已连接</el-tag></div>
        <p>账号与加密云空间</p>
      </div>
      <el-button class="account-center" type="primary" plain @click="accountCenter">管理账号</el-button>
    </header>
    <div class="capacity-card">
      <div class="capacity-label">
        <div><span>存储空间</span><small v-if="known">{{ officialBytes(q.usedBytes) }} / {{ officialBytes(q.quotaBytes) }}</small></div
        ><strong>{{ known ? ratio.toFixed(1) + '%' : '待核对' }}</strong>
      </div>
      <el-progress
        :percentage="known ? Math.min(100, ratio) : 0"
        :stroke-width="10"
        :show-text="false"
        :color="color"
      />
      <div class="capacity-values">
        <template v-if="remainingPasswords !== null">
          <span>预计还可存储</span>
          <span class="capacity-count">{{ remainingPasswords }}</span>
          <span>个密码</span>
        </template>
        <span v-else>{{ known && !store.allPasswordArray.length ? '添加密码后可估算剩余数量' : '暂无法估算剩余数量' }}</span>
      </div>
      <p v-if="q.quotaUntil">临时额度至 {{ officialDate(q.quotaUntil) }}</p>
    </div>
    <dl class="account-fields">
      <div>
        <dt>用户 ID</dt>
        <dd>
          <span>{{ userId }}</span
          ><el-button
            link
            type="primary"
            aria-label="复制用户 ID"
            @click="copyText(userId)"
            >复制</el-button
          >
        </dd>
      </div>
      <div>
        <dt>注册时间</dt>
        <dd>{{ officialDate(info.user.createdAt) }}</dd>
      </div>
      <div v-if="identity">
        <dt>本次登录</dt>
        <dd>{{ modes[identity.provider] || identity.provider }}</dd>
      </div>
      <div v-if="identity?.value">
        <dt>登录身份</dt>
        <dd>{{ identity.value }}</dd>
      </div>
    </dl>
    <div class="account-actions" v-if="store.serviceStatus === ServiceStatus.WAIT_INIT">
      <el-button
        type="primary"
        @click="initialize"
        >设置主密码</el-button
      >
    </div>
  </section>
  <el-empty v-else description="账号信息暂不可用，请重新连接官方存储" />
</template>
<style scoped>
.official-info {
  min-width: 0;
  max-width: 620px;
  margin: 8px auto;
  padding: 4px 18px 24px;
  color: var(--el-text-color-primary);
}
.identity-heading {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 24px;
}
.identity-heading img {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}
.identity-heading > div { min-width: 0; }
.heading-title { display: flex; align-items: center; gap: 9px; }
.identity-heading h2 {
  font-size: 20px;
  margin: 0;
}
.identity-heading p {
  margin: 5px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.identity-heading .account-center {
  margin-left: auto;
  flex-shrink: 0;
}
.capacity-card {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  padding: 20px;
}
.capacity-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  font-size: 13px;
}
.capacity-label > div { display: flex; flex-direction: column; gap: 5px; }
.capacity-label small { color: var(--el-text-color-secondary); font-size: 11px; }
.capacity-label strong {
  font-size: 18px;
}
.capacity-values {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 7px;
  margin-top: 17px;
}
.capacity-values span,
.capacity-card p {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.capacity-values .capacity-count {
  color: #49c3ff;
}
.capacity-card p {
  margin: 10px 0 0;
  line-height: 1.6;
}
.account-fields {
  margin: 22px 0;
  padding: 2px 18px;
  border: 1px solid var(--el-border-color-extra-light);
  border-radius: 12px;
  background: var(--el-bg-color);
}
.account-fields > div {
  display: flex;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  font-size: 13px;
}
.account-fields dt {
  width: 85px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.account-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.account-fields > div:last-child { border-bottom: 0; }
.account-actions {
  display: flex;
  gap: 8px;
}
@media (max-width: 600px) {
  .official-info {
    padding: 4px 4px 20px;
  }
  .identity-heading { align-items: flex-start; }
  .identity-heading .account-center { padding-inline: 12px; }
  .capacity-card {
    padding: 16px;
  }
  .account-fields > div {
    gap: 8px;
  }
  .account-fields { padding-inline: 14px; }
  .account-fields dt {
    width: 70px;
  }
  .account-fields dd {
    flex-wrap: wrap;
  }
}
</style>
