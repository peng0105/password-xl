<!--备份与恢复-->
<script lang="ts" setup>
import { BackupFile, Label, Password, PasswordRelation, ServiceStatus } from '@/types'
import { displaySize, formatterDate, getLabelCount } from '@/utils/global.ts'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import { useRefStore } from '@/stores/RefStore.ts'
import FileSaver from 'file-saver'
import { checkPassword, decryptAES } from '@/utils/security.ts'
import { decompressionArray } from '@/utils/compress'
import { normalizePasswordArray } from '@/utils/passwordFieldOrder.ts'
import { readRelations } from '@/service/relationStorage.ts'
import { preparePasswordRecovery } from '@/service/passwordRecovery.ts'

const passwordStore = usePasswordStore()
const refStore = useRefStore()

// 是否显示选择恢复方式弹框
const visRecovery = ref(false)
// 文件选择input Ref
const fileInput = ref()
// 准备恢复的密码列表
const recoveryPasswordArray: Ref<Array<Password>> = ref([])
// 准备恢复的标签列表
const recoveryLabelArray: Ref<Array<Label>> = ref([])
const recoveryRelations = ref<PasswordRelation[]>([])
const recovering = ref(false)
let recoveryVersion = 0

watch(
  [() => passwordStore.serviceStatus, () => passwordStore.passwordManager],
  ([status]) => {
    recoveryVersion++
    if (status !== ServiceStatus.UNLOCKED) {
      visRecovery.value = false
      recoveryPasswordArray.value = []
      recoveryLabelArray.value = []
      recoveryRelations.value = []
    }
  },
  { flush: 'sync' },
)

const isRecoveryCurrent = (version: number, manager = passwordStore.passwordManager) =>
  version === recoveryVersion &&
  manager === passwordStore.passwordManager &&
  passwordStore.serviceStatus === ServiceStatus.UNLOCKED

// 密码备份
const backup = (auto: boolean) => {
  console.log('密码备份 auto:', auto)
  let storeData = passwordStore.passwordManager.getStoreData()
  if (!storeData) {
    console.error('系统异常 备份文件不存在')
    ElNotification.error({ title: '系统异常', message: '备份文件不存在' })
    return
  }

  let backupType = auto
    ? `您与“${formatterDate(Date.now(), 'YYYY-MM-DD HH:mm')}” 进行密码恢复时系统自动备份了该文件，`
    : `您于“${formatterDate(Date.now(), 'YYYY-MM-DD HH:mm')}” 手动备份了该文件，`
  let passwordCount = passwordStore.allPasswordArray.length
  let labelCount = getLabelCount()

  let backupFile: BackupFile = {
    explain: `此文件为password-XL 密码备份文件，${backupType}此文件包含：${passwordCount} 个密码、${labelCount} 个标签。 password-XL 官网服务地址为：https://password-xl.cn`,
    storeData: storeData,
    backupTime: Date.now(),
  }

  let fileName = '密码备份 ' + formatterDate(Date.now(), 'YYYY-MM-DD HH:mm:ss') + '.json'
  const blob = new Blob([JSON.stringify(backupFile)], { type: 'text/plain;charset=utf-8' })

  console.log('密码备份 导出文件:', fileName)
  FileSaver.saveAs(blob, fileName)
}

// 密码恢复
const recovery = () => {
  console.log('密码恢复')
  // 选择恢复文件
  fileInput.value.click()
}

// 文件选择器选择了文件
const fileChange = () => {
  if (fileInput.value.files.length === 0) {
    return
  }
  console.log('密码备份,文件选择器选择了文件：', fileInput.value.files.length)
  let file = fileInput.value.files[0]
  const version = ++recoveryVersion
  const manager = passwordStore.passwordManager
  let fileReader = new FileReader()
  fileReader.onload = async () => {
    if (!fileReader.result || !isRecoveryCurrent(version, manager)) {
      return
    }
    try {
      let backupFile: BackupFile = JSON.parse(fileReader.result as string)
      fileInput.value.value = ''
      // 开始恢复文件
      await startRecovery(backupFile, version, manager)
    } catch (e) {
      console.error(e)
      ElNotification.error({ title: '恢复失败', message: '请检查备份文件是否正确' })
    }
  }
  fileReader.readAsText(file)
}

// 开始恢复密码
const startRecovery = async (
  backupFile: BackupFile,
  version: number,
  manager: typeof passwordStore.passwordManager,
) => {
  console.log('密码备份,开始恢复密码')
  let passwordText, labelText
  let relations: PasswordRelation[] = []
  // 检查当前主密码是否可以解锁备份文件
  let checkUnlockFile = checkPassword(passwordStore.mainPassword, backupFile.storeData.passwordData)
  console.log('密码备份, 检查当前主密码是否可以解锁备份文件:', checkUnlockFile)
  if (checkUnlockFile) {
    // 当前主密码可以解锁备份文件
    passwordText = decryptAES(passwordStore.mainPassword, backupFile.storeData.passwordData)
    labelText = decryptAES(passwordStore.mainPassword, backupFile.storeData.labelData)
    relations = readRelations(backupFile.storeData, passwordStore.mainPassword)
  } else {
    // 当前主密码无法解锁备份文件，需要用户输入备份文件的主密码
    let mainPassword = await refStore.verifyPasswordRef.getAndVerify(
      (mainPassword: string) => checkPassword(mainPassword, backupFile.storeData.passwordData),
      backupFile.storeData.mainPasswordType,
    )
    if (!isRecoveryCurrent(version, manager)) return
    if (mainPassword) {
      passwordText = decryptAES(mainPassword, backupFile.storeData.passwordData)
      labelText = decryptAES(mainPassword, backupFile.storeData.labelData)
      relations = readRelations(backupFile.storeData, mainPassword)
    }
  }

  if (!passwordText || !labelText) {
    console.log('密码恢复失败, 请检查备份文件及主密码是否正确')
    ElNotification.error({ title: '恢复失败', message: '请检查备份文件及主密码是否正确' })
    return false
  }

  // 解压缩密码列表
  const recovered = preparePasswordRecovery(
    { passwords: [], labels: [], relations: [] },
    {
      passwords: normalizePasswordArray(decompressionArray(JSON.parse(passwordText))),
      labels: JSON.parse(labelText),
      relations,
    },
    'cover',
  )
  recoveryPasswordArray.value = recovered.passwords
  recoveryLabelArray.value = recovered.labels
  recoveryRelations.value = recovered.relations
  console.log(
    '密码恢复, 解压缩密码列表: ',
    recoveryPasswordArray.value.length,
    recoveryLabelArray.value,
  )

  if (!passwordStore.allPasswordArray.length && !passwordStore.labelArray.length) {
    // 当前列表没有密码直接恢复
    console.log('密码恢复, 当前列表没有密码直接恢复')
    coverRecovery()
  } else {
    // 当前列表已有密码或标签，选择恢复方式
    visRecovery.value = true
  }
}

// 覆盖方式恢复
const coverRecovery = () => restore('cover')

// 合并方式恢复
const mergeRecovery = () => restore('merge')

const restore = async (mode: 'cover' | 'merge') => {
  if (recovering.value || passwordStore.serviceStatus !== ServiceStatus.UNLOCKED) return
  recovering.value = true
  const version = recoveryVersion
  const manager = passwordStore.passwordManager
  try {
    const verified = await refStore.verifyPasswordRef.verifySensitive()
    // 验证弹窗等待期间可能锁定或切换账号，旧回调不得覆盖新会话。
    if (!verified || !isRecoveryCurrent(version, manager)) return
    const recovered = preparePasswordRecovery(
      {
        passwords: passwordStore.allPasswordArray,
        labels: passwordStore.labelArray,
        relations: passwordStore.relations,
      },
      {
        passwords: recoveryPasswordArray.value,
        labels: recoveryLabelArray.value,
        relations: recoveryRelations.value,
      },
      mode,
    )
    if (passwordStore.allPasswordArray.length || passwordStore.labelArray.length) {
      backup(true)
      ElMessage.success('已为您自动备份现有密码')
    }
    passwordStore.$patch({
      allPasswordArray: recovered.passwords,
      labelArray: recovered.labels,
      relations: recovered.relations,
    })
    const result = await manager.syncStoreData()
    if (!isRecoveryCurrent(version, manager)) return
    if (result.status) {
      ElMessage.success('密码恢复成功')
      visRecovery.value = false
      recoveryPasswordArray.value = []
      recoveryLabelArray.value = []
      recoveryRelations.value = []
    }
  } catch (error) {
    if (isRecoveryCurrent(version, manager)) {
      ElNotification.error({
        title: '恢复失败',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    recovering.value = false
  }
}

defineExpose({
  backup,
  recovery,
})
</script>

<template>
  <input
    ref="fileInput"
    accept="application/json"
    style="display: none"
    type="file"
    @change="fileChange()"
  />
  <el-dialog
    v-model="visRecovery"
    :fullscreen="['xs', 'sm'].includes(displaySize().value)"
    draggable
    width="600px"
  >
    <template #header>
      <el-text size="large" style="user-select: none">
        <span class="iconfont icon-recovery"></span>
        恢复密码 <span style="font-weight: bold">·</span> 请选择恢复方式
      </el-text>
    </template>
    <el-row>
      <el-col :md="{ span: 12 }" :sm="{ span: 24 }" class="recovery-col">
        <div class="recovery-type recovery-merge" @click="mergeRecovery">
          <div style="position: absolute; padding: 7px">
            <el-tag effect="dark" type="success">推荐</el-tag>
          </div>
          <div class="icon-div">
            <span class="iconfont icon-merge"></span>
          </div>
          <el-text class="recovery-text"> 合并恢复 </el-text>
          <div style="margin-top: 20px; padding: 10px">
            <el-text>将现有密码与备份文件中的密码合并（修改过的密码会添加备注说明）</el-text>
          </div>
        </div>
      </el-col>
      <el-col :md="{ span: 12 }" :sm="{ span: 24 }" class="recovery-col">
        <div class="recovery-type recovery-cover" @click="coverRecovery">
          <div class="icon-div">
            <span class="iconfont icon-cover"></span>
          </div>
          <el-text class="recovery-text"> 覆盖恢复 </el-text>
          <div style="margin-top: 20px; padding: 10px">
            <el-text>使用备份文件覆盖密码列表，现有的密码和标签都将被删除</el-text>
          </div>
        </div>
      </el-col>
    </el-row>
  </el-dialog>
</template>

<style scoped>
.icon-recovery {
  font-size: 110%;
  color: #409eff;
  margin-right: 5px;
}

.recovery-type {
  height: 300px;
  width: 100%;
  border-radius: 5px;
  text-align: center;
}

.icon-div {
  padding-top: 20px;
  margin-bottom: 20px;
}

.recovery-merge {
  background-color: #c6e2ff;
  cursor: pointer;
}

.recovery-merge:hover {
  background-color: #a5d2ff;
}

.recovery-cover {
  background-color: #fcd3d3;
  cursor: pointer;
}

.recovery-cover:hover {
  background-color: #ffbfbf;
}

.icon-merge {
  color: #409eff;
  font-size: 130px;
}

.icon-cover {
  color: #f56c6c;
  font-size: 130px;
}

.recovery-col {
  padding: 15px;
}

.recovery-text {
  font-size: 25px;
}
</style>
