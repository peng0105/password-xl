<script lang="ts" setup>
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {comparePassword, displaySize, incrId} from "@/utils/global.ts";
import {Password, PasswordStatus, ServiceStatus} from "@/types";
import {extractPasswordApi} from "@/api/password-xl-api.ts";
import {normalizePasswordFieldOrder} from "@/utils/passwordFieldOrder.ts";
import type {ExtractedPassword} from '@/utils/aiPasswordExtraction.ts';

const passwordTableRef = ref()
const aiImportVis = ref(false)
// 导入步骤 1.填写信息 2.解析中 3.确认导入
const step = ref(1)
const passwordStore = usePasswordStore()
const refStore = useRefStore()
const passwordText = ref('')
const importPasswords = ref<Password[]>([])
const selectedPasswords = ref<Password[]>([])
const saving = ref(false)
let sessionId = 0
let verificationId = 0

const reset = () => {
  sessionId++
  verificationId++
  passwordText.value = ''
  importPasswords.value = []
  selectedPasswords.value = []
  step.value = 1
}

// 两个入口共享转换与确认界面，首页可直接传入解析结果，无需再次请求AI。
const showParsedPasswords = (passwords: ExtractedPassword[]) => {
  if (saving.value) return
  if (!passwords.length) {
    ElMessage.warning('未识别到密码信息')
    return
  }
  const currentSession = ++sessionId
  verificationId++
  selectedPasswords.value = []
  importPasswords.value = passwords.map(password => normalizePasswordFieldOrder({
    id: incrId(),
    title: password.name,
    address: password.address,
    username: password.username,
    password: password.password,
    remark: password.remark,
    addTime: Date.now(),
    updateTime: Date.now(),
    deleteTime: 0,
    favoriteTime: 0,
    favorite: false,
    customFields: [],
    labels: [],
    status: PasswordStatus.NORMAL,
    bgColor: '',
  }))
  aiImportVis.value = true
  step.value = 3
  nextTick(() => {
    if (currentSession !== sessionId || !aiImportVis.value) return
    passwordTableRef.value?.clearSelection()
    for (const password of importPasswords.value) {
      if (selectCheck(password)) passwordTableRef.value?.toggleRowSelection(password, true)
    }
  })
}

const startAnalysis = async () => {
  if (step.value === 2 || saving.value) return
  if (!passwordText.value.trim()) {
    ElMessage.warning('请输入密码信息')
    return
  }
  const currentSession = ++sessionId
  importPasswords.value = []
  selectedPasswords.value = []
  step.value = 2
  try {
    const passwords = await extractPasswordApi(passwordText.value)
    if (currentSession !== sessionId || !aiImportVis.value) return
    if (!passwords.length) {
      step.value = 1
      ElMessage.warning('未识别到密码信息')
      return
    }
    showParsedPasswords(passwords)
  } catch (error) {
    if (currentSession !== sessionId || !aiImportVis.value) return
    step.value = 1
    ElNotification.error({title: '解析失败', message: error instanceof Error ? error.message : String(error)})
  }
}

const affirmImport = async () => {
  if (saving.value) return
  const passwords = selectedPasswords.value.filter(selectCheck)
  if (!passwords.length) {
    ElMessage.warning('请选择要导入的密码')
    return
  }
  const currentSession = sessionId
  const currentVerification = ++verificationId
  let startedSaving = false
  try {
    // 现有验证弹窗取消时Promise不结束；只在通过验证后进入保存状态，允许取消后重试。
    await refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword))
    if (currentSession !== sessionId || currentVerification !== verificationId || !aiImportVis.value || saving.value) return
    saving.value = true
    startedSaving = true
    mergePasswords(passwordStore.allPasswordArray, passwords)
    const syncResp = await passwordStore.passwordManager.syncStoreData()
    if (currentSession !== sessionId) return
    if (!syncResp.status) {
      ElNotification.error({title: '导入失败', message: syncResp.message || '导入保存失败'})
      return
    }
    aiImportVis.value = false
    ElNotification.success('导入成功')
  } catch (error) {
    if (currentSession === sessionId && currentVerification === verificationId) {
      ElNotification.error({title: '导入失败', message: error instanceof Error ? error.message : String(error)})
    }
  } finally {
    if (startedSaving) saving.value = false
  }
}

const mergePasswords = (passwordArray: Password[], mergePasswordArray: Password[]) => {
  mergePasswordArray.forEach(mergePassword => {
    const existingPassword = passwordArray.find(password => comparePassword(password, mergePassword))
    if (existingPassword) {
      existingPassword.status = PasswordStatus.NORMAL
    } else {
      // 保存时使用副本，失败回滚不会改变确认列表，可继续重试。
      passwordArray.push({...mergePassword, customFields: [], labels: []})
    }
  })
}

const selectCheck = (row: Password) => {
  return !passwordStore.allPasswordArray.some(password => password.status === PasswordStatus.NORMAL && comparePassword(password, row))
}

const batchImport = () => {
  if (saving.value) return
  reset()
  aiImportVis.value = true
}

watch(aiImportVis, visible => {
  if (!visible) reset()
}, {flush: 'sync'})
watch(() => passwordStore.serviceStatus, status => {
  if (status !== ServiceStatus.UNLOCKED) aiImportVis.value = false
}, {flush: 'sync'})
onBeforeUnmount(reset)

defineExpose({batchImport, showParsedPasswords})
</script>

<template>
  <el-dialog v-model="aiImportVis" title="AI批量导入" top="10vh"
      :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving"
      :width="['xs','sm','md'].includes(displaySize().value)?'95%':'70%'">
    <div v-if="step === 1">
      <el-input type="textarea" class="password-text-input" v-model="passwordText" placeholder="请粘贴密码内容，例如：
      阿里云ECS 10.12.3.45 root/P@x92Q5m#jjL
      2026年临时用的"></el-input>
    </div>
    <div v-if="step === 2" v-loading="true" element-loading-text="正在解析..." style="height: 55vh"></div>
    <div v-if="step === 3" v-loading="saving" element-loading-text="正在保存...">
      <el-table ref="passwordTableRef" :data="importPasswords" height="55vh" @selection-change="selectedPasswords = $event">
        <el-table-column type="selection" :selectable="selectCheck" width="55"></el-table-column>
        <el-table-column width="55">
          <template #default="scope">
            <el-tooltip v-if="selectCheck(scope.row as Password)" content="可导入" placement="top">
              <span class="iconfont icon-info" style="color: #409EFF;font-size: 16px"></span>
            </el-tooltip>
            <el-tooltip v-else content="已存在密码不可导入" placement="top">
              <span class="iconfont icon-info" style="color: #ff9600;font-size: 16px"></span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="100px" prop="title"></el-table-column>
        <el-table-column label="地址" min-width="150px" prop="address"></el-table-column>
        <el-table-column label="用户名" min-width="100px" prop="username"></el-table-column>
        <el-table-column label="密码" prop="password" width="180px">
          <template #default="scope">
            <el-text line-clamp="3" truncated>{{ scope.row.password }}</el-text>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="100px" prop="remark"></el-table-column>
      </el-table>
    </div>

    <template #footer>
      <el-button v-if="step === 1" :disabled="!passwordText.trim()" type="primary" @click="startAnalysis">开始解析</el-button>
      <el-button v-if="step === 3" :disabled="!selectedPasswords.length || saving" :loading="saving" type="primary" @click="affirmImport">确认导入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
:deep(.password-text-input textarea) {
  height: 55vh !important;
}

</style>
