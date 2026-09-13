<script setup lang="ts">
import {
  officialApi,
  officialOrigin,
  officialState,
  clearOfficial,
} from '@/service/OfficialSession'
import { usePasswordStore } from '@/stores/PasswordStore'
import { useRefStore } from '@/stores/RefStore'
import { ServiceStatus } from '@/types'
const store = usePasswordStore(),
  refs = useRefStore()
const visible = ref(false),
  step = ref(0),
  busy = ref(false),
  error = ref(''),
  code = ref(''),
  confirmation = ref('')
const ticket = ref<{
  requestId: string
  receiptToken: string
  provider: string
  expiresAt: string
} | null>(null)
let owner = '',
  popup: Window | null = null
const open = () => {
  owner = officialState.info?.user.id || ''
  step.value = 0
  ticket.value = null
  code.value = ''
  confirmation.value = ''
  error.value = ''
  visible.value = true
}
const assertOwner = () => {
  if (!owner || owner !== officialState.info?.user.id)
    throw new Error('账号已变化，请重新操作')
}
async function begin() {
  error.value = ''
  if (store.serviceStatus !== ServiceStatus.WAIT_INIT) {
    const password = await refs.verifyPasswordRef.verifySensitive()
    if (password === null) return
  }
  busy.value = true
  try {
    assertOwner()
    ticket.value = await officialApi('/account/deletion/start')
    step.value = 1
  } catch (e: any) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
async function verify() {
  busy.value = true
  error.value = ''
  try {
    assertOwner()
    await officialApi('/account/deletion/email/verify', {
      ...ticket.value,
      code: code.value,
    })
    step.value = 2
  } catch (e: any) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
async function github() {
  popup = window.open(
    'about:blank',
    'official-deletion-github',
    'width=620,height=760',
  )
  if (!popup) {
    error.value = '请允许弹出窗口，或重试验证'
    return
  }
  busy.value = true
  error.value = ''
  try {
    assertOwner()
    const result = await officialApi('/account/deletion/github', ticket.value)
    popup.location.href = result.url
  } catch (e: any) {
    popup.close()
    error.value = e.message
  } finally {
    busy.value = false
  }
}
async function checkGithub(event: MessageEvent) {
  if (
    event.origin !== officialOrigin ||
    event.source !== popup ||
    event.data?.type !== 'official-deletion-verified'
  )
    return
  if (!event.data.ok) {
    error.value = '身份验证未通过，请使用原 GitHub 账号重试'
    return
  }
  try {
    assertOwner()
    const result = await officialApi('/account/deletion/result', ticket.value)
    if (result.status === 'VERIFIED') step.value = 2
  } catch (e: any) {
    error.value = e.message
  }
}
onMounted(() => window.addEventListener('message', checkGithub))
onUnmounted(() => {
  window.removeEventListener('message', checkGithub)
  popup?.close()
})
async function submit() {
  if (confirmation.value !== '注销账号' || !ticket.value) return
  busy.value = true
  error.value = ''
  try {
    assertOwner()
    const request = { ...ticket.value }
    await store.passwordManager.withPausedWrites(async () => {
      sessionStorage.setItem(
        'official-deletion-receipt',
        JSON.stringify(request),
      )
      let result
      try {
        result = await officialApi('/account/deletion/submit', {
          ...request,
          confirmation: 'DELETE_ACCOUNT',
        })
      } catch (e: any) {
        result = await officialApi('/account/deletion/result', request).catch(
          () => null,
        )
        if (!result && (!e.status || e.status >= 500)) {
          // An uncertain response must never resume writes using an old OSS grant.
          clearOfficial(true)
          await store.logout(false, true)
          return
        }
        if (!result || !['CLEANING', 'COMPLETED'].includes(result.status))
          throw e
      }
      if (!['CLEANING', 'COMPLETED'].includes(result.status))
        throw new Error('注销尚未提交，请重试')
      clearOfficial(true)
      await store.logout(false, true)
    })
  } catch (e: any) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
function exportPage() {
  visible.value = false
  refs.settingRef.openSetting('backup')
}
defineExpose({ open })
</script>
<template>
  <el-dialog
    v-model="visible"
    title="注销官方账号"
    width="min(510px, 94vw)"
    append-to-body
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
  >
    <div class="deletion-content">
      <el-steps :active="step" simple finish-status="success"
        ><el-step title="主密码" /><el-step title="账号验证" /><el-step
          title="确认注销"
      /></el-steps>
      <template v-if="step === 0"
        ><h3>离开前，请确认已备份需要的数据</h3>
        <p>
          注销将停用官方账号、退出所有设备，并删除官方密码库和设置。原有其他存储的数据不受影响。
        </p>
        <p>
          确认后不可撤销。旧存储授权可能暂时有效，文件将在至少 12
          小时后完成最终清理；清理失败会重试。已导出的文件及离线备份不会被远程删除。
        </p>
        <el-button link type="primary" @click="exportPage"
          >前往备份与导出</el-button
        >
        <p v-if="store.serviceStatus === ServiceStatus.WAIT_INIT">
          密码库尚未初始化，将直接验证账号身份。
        </p></template
      >
      <template v-else-if="step === 1"
        ><h3>确认这是你本人的账号</h3>
        <template v-if="ticket?.provider === 'email'"
          ><p>
            注销专用验证码已发送至
            {{
              officialState.info?.loginIdentity?.value ||
              officialState.info?.user.email
            }}，5 分钟内有效。
          </p>
          <el-input
            v-model="code"
            aria-label="注销验证码"
            placeholder="6 位注销验证码"
            maxlength="6"
            autocomplete="one-time-code"
            @keyup.enter="verify" /></template
        ><template v-else
          ><p>请在新窗口中使用原 GitHub 账号完成身份验证。</p>
          <el-button :loading="busy" @click="github"
            >验证 GitHub 身份</el-button
          ></template
        >
        <p>
          <el-button link :disabled="busy" @click="step = 0"
            >重新开始验证</el-button
          >
        </p></template
      >
      <template v-else
        ><h3>身份已验证，最后确认一次</h3>
        <p>这会注销整个官方账号，不只是清空密码库。请输入“注销账号”确认。</p>
        <el-input
          v-model="confirmation"
          aria-label="注销确认文字"
          placeholder="注销账号"
          autocomplete="off"
      /></template>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 16px"
      />
    </div>
    <template #footer
      ><el-button :disabled="busy" @click="visible = false">取消</el-button
      ><el-button
        v-if="step === 0"
        type="primary"
        :loading="busy"
        @click="begin"
        >{{
          store.serviceStatus === ServiceStatus.WAIT_INIT
            ? '验证账号身份'
            : '验证主密码'
        }}</el-button
      ><el-button
        v-else-if="step === 1 && ticket?.provider === 'email'"
        type="primary"
        :disabled="code.length !== 6"
        :loading="busy"
        @click="verify"
        >验证身份</el-button
      ><el-button
        v-else-if="step === 2"
        type="danger"
        :disabled="confirmation !== '注销账号'"
        :loading="busy"
        @click="submit"
        >确认注销</el-button
      ></template
    >
  </el-dialog>
</template>
<style scoped>
.deletion-content {
  line-height: 1.8;
}
.deletion-content h3 {
  font-size: 16px;
  margin: 24px 0 8px;
}
.deletion-content p {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.deletion-content :deep(.el-step__title) {
  font-size: 12px;
}
</style>
