<script lang="ts" setup>
import {displaySize} from "@/utils/global.ts";
import {extractPasswordApi} from "@/api/password-xl-api.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {usePasswordStore} from '@/stores/PasswordStore.ts';
import {AiProvider, ServiceStatus} from "@/types";

const refStore = useRefStore()
const settingStore = useSettingStore()
const passwordStore = usePasswordStore()
let requestId = 0

const alertInfo = ref({
  vis: false,
  loading: false,
  text: ''
})

const show = () => {
  requestId++
  alertInfo.value.text = ''
  alertInfo.value.loading = false
  alertInfo.value.vis = true
}

const extractPassword = async () => {
  if (alertInfo.value.loading || !alertInfo.value.text.trim()) return
  const currentRequest = ++requestId
  alertInfo.value.loading = true
  try {
    const passwords = await extractPasswordApi(alertInfo.value.text)
    if (currentRequest !== requestId || !alertInfo.value.vis) return
    if (!passwords.length) {
      ElMessage.warning('未识别到密码信息')
      return
    }
    if (passwords.length === 1) {
      refStore.passwordFormRef.addPasswordForm()
      refStore.passwordFormRef.setPasswordForm(passwords[0])
    } else {
      refStore.aiImportRef.showParsedPasswords(passwords)
    }
    alertInfo.value.vis = false
  } catch (error) {
    if (currentRequest === requestId && alertInfo.value.vis) {
      ElNotification.error({title: '解析失败', message: error instanceof Error ? error.message : String(error)})
    }
  } finally {
    if (currentRequest === requestId) alertInfo.value.loading = false
  }
}

watch(() => alertInfo.value.vis, vis => {
  if (!vis) {
    requestId++
    alertInfo.value.loading = false
    alertInfo.value.text = ''
  }
}, {flush: 'sync'})
watch(() => passwordStore.serviceStatus, status => {
  if (status !== ServiceStatus.UNLOCKED) alertInfo.value.vis = false
}, {flush: 'sync'})
onBeforeUnmount(() => { requestId++ })

defineExpose({
  show
})
</script>

<template>
  <el-dialog
      v-model="alertInfo.vis"
      :width="['xs', 'sm'].includes(displaySize().value)?'95%':'550px'"
      title="AI创建密码">
    <div v-loading="alertInfo.loading" element-loading-text="正在处理...">
      <el-text type="info">
        你可以粘贴一条或多条账号密码信息，AI将逐条识别，多条结果可勾选后批量导入
      </el-text>
      <div style="margin-top: 10px">
        <el-input v-model="alertInfo.text" :rows="6" placeholder="请粘贴账号密码到这里" type="textarea"></el-input>
      </div>
      <el-text size="small" type="danger">
        {{
          settingStore.setting.aiModel.provider === AiProvider.OFFICIAL
              ? '您的密码信息将在加密后传输至Ai大模型进行处理，密码信息不会以任何形式进行存储'
              : '您的密码信息将由浏览器直接发送至您配置的AI模型服务，请确认服务提供方可信'
        }}
      </el-text>
    </div>
    <template #footer>
      <el-button :disabled="!alertInfo.text.trim() || alertInfo.loading" plain
                 type="primary"
                 @click="extractPassword">
        Ai解析
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>

</style>
