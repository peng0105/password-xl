<script setup lang="ts">
import { officialOrigin, officialState } from '@/service/OfficialSession'
import { officialBytes, officialDate } from '@/service/officialPresentation'
import { copyText } from '@/utils/global'
import { usePasswordStore } from '@/stores/PasswordStore'
import { useRefStore } from '@/stores/RefStore'
import { ServiceStatus } from '@/types'
import logo from '@/assets/images/logo.svg'
import OfficialAccountDeletion from './OfficialAccountDeletion.vue'
const store = usePasswordStore()
const refs = useRefStore()
const info = computed(() => officialState.info),
  q = computed(() => info.value?.quota)
const ratio = computed(() =>
  q.value?.quotaBytes ? (q.value.usedBytes / q.value.quotaBytes) * 100 : 0,
)
const known = computed(() => !!q.value && info.value?.usageKnown !== false)
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
const labels: Record<string, string> = {
  email: '邮箱',
  github: 'GitHub 用户名',
  phone: '手机号',
  sms: '手机号',
}
const modes: Record<string, string> = {
  email: '邮箱验证码',
  github: 'GitHub',
  phone: '手机号',
  sms: '手机号',
}
const state = computed(() =>
  info.value?.storageDisabled
    ? '已暂停'
    : ratio.value >= 200
      ? '暂不可用'
      : ratio.value >= 100
        ? '空间已满'
        : '已连接',
)
const deletion = ref()
const accountCenter = () => window.open(officialOrigin, '_blank', 'noopener')
function initialize() {
  refs.settingRef.closeSetting()
  refs.setPasswordRef.setMainPassword()
}
async function logout() {
  await store.passwordManager.withPausedWrites(() => store.logout())
}
</script>
<template>
  <section class="official-info" v-if="info && q">
    <header class="identity-heading">
      <img :src="logo" alt="password-XL" />
      <div>
        <h2>官方存储</h2>
        <p>你的账号与云端空间</p>
      </div>
      <el-tag
        :type="ratio >= 100 || info.storageDisabled ? 'warning' : 'primary'"
        effect="light"
        round
        >{{ state }}</el-tag
      >
    </header>
    <div class="capacity-card">
      <div class="capacity-label">
        <span>存储空间</span
        ><strong>{{ known ? ratio.toFixed(1) + '%' : '待核对' }}</strong>
      </div>
      <el-progress
        :percentage="known ? Math.min(100, ratio) : 0"
        :stroke-width="10"
        :show-text="false"
        :color="color"
      />
      <div class="capacity-values">
        <strong>{{ known ? officialBytes(q.usedBytes) : '用量未知' }}</strong
        ><span>/ {{ officialBytes(q.quotaBytes) }}</span>
      </div>
      <p v-if="officialState.usageDirty">
        已按本页保存更新，下次连接时核对云端用量
      </p>
      <p v-else>
        最近核对：{{ officialDate(q.checkedAt)
        }}{{ q.checkFailed ? '（暂未核对成功）' : '' }}
      </p>
      <p v-if="q.quotaUntil">临时额度至 {{ officialDate(q.quotaUntil) }}</p>
    </div>
    <dl class="account-fields">
      <div>
        <dt>用户 ID</dt>
        <dd>
          <span class="user-id">{{ info.user.id }}</span
          ><el-button
            link
            type="primary"
            aria-label="复制用户 ID"
            @click="copyText(info.user.id)"
            >复制</el-button
          >
        </dd>
      </div>
      <div>
        <dt>注册时间</dt>
        <dd>{{ officialDate(info.user.createdAt) }}</dd>
      </div>
      <div v-if="identity">
        <dt>登录方式</dt>
        <dd>{{ modes[identity.provider] || identity.provider }}</dd>
      </div>
      <div v-if="identity?.value">
        <dt>{{ labels[identity.provider] || '登录身份' }}</dt>
        <dd>{{ identity.value }}</dd>
      </div>
    </dl>
    <div class="account-actions">
      <el-button
        v-if="store.serviceStatus === ServiceStatus.WAIT_INIT"
        type="primary"
        @click="initialize"
        >设置主密码</el-button
      ><el-button type="primary" plain @click="accountCenter"
        >账号中心</el-button
      ><el-button @click="logout">退出登录</el-button>
    </div>
    <div class="account-danger">
      <div>
        <strong>注销官方账号</strong>
        <p>删除账号与官方密码库，此操作不可撤销。</p>
      </div>
      <el-button text type="danger" @click="deletion.open()"
        >注销账号</el-button
      >
    </div>
    <OfficialAccountDeletion ref="deletion" />
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
}
.identity-heading h2 {
  font-size: 20px;
  margin: 0 0 5px;
}
.identity-heading p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.identity-heading .el-tag {
  margin-left: auto;
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
.capacity-label strong {
  font-size: 18px;
}
.capacity-values {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-top: 17px;
}
.capacity-values strong {
  font-size: 23px;
}
.capacity-values span,
.capacity-card p {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.capacity-card p {
  margin: 10px 0 0;
  line-height: 1.6;
}
.account-fields {
  margin: 22px 0;
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
.user-id {
  font-family: monospace;
}
.account-actions {
  display: flex;
  gap: 8px;
}
.account-danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: 27px;
  padding-top: 20px;
  font-size: 13px;
}
.account-danger p {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
  margin: 7px 0 0;
}
@media (max-width: 600px) {
  .official-info {
    padding: 4px 4px 20px;
  }
  .capacity-card {
    padding: 16px;
  }
  .account-fields > div {
    gap: 8px;
  }
  .account-fields dt {
    width: 70px;
  }
  .account-fields dd {
    flex-wrap: wrap;
  }
  .account-danger {
    align-items: flex-start;
  }
}
</style>
