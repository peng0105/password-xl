<!--备份与恢复-->
<script setup lang="ts">
import {BackupFile, Label, Password} from "@/types";
import {displaySize, formatterDate, getLabelCount, mergeLabel, mergePassword} from "@/utils/global.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import FileSaver from "file-saver";
import {checkPassword, decryptAES} from "@/utils/security.ts";
import {decompressionArray} from "@/utils/compress";

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

// 密码备份
const backup = (auto: boolean) => {
  console.log('密码备份 auto:', auto)
  let storeData = passwordStore.passwordManager.getStoreData()
  if (!storeData) {
    console.error('系统异常 备份文件不存在')
    ElNotification.error({title: '系统异常',message: '备份文件不存在'})
    return
  }

  let backupType = auto ? `您与“${formatterDate(Date.now(),'YYYY-MM-DD HH:mm')}” 进行密码恢复时系统自动备份了该文件，` : `您于“${formatterDate(Date.now(),'YYYY-MM-DD HH:mm')}” 手动备份了该文件，`
  let passwordCount = passwordStore.allPasswordArray.length;
  let labelCount = getLabelCount();

  let backupFile: BackupFile = {
    explain: `此文件为password-XL 密码备份文件，${backupType}此文件包含：${passwordCount} 个密码、${labelCount} 个标签。 password-XL 官网服务地址为：https://password-xl.cn`,
    storeData: storeData,
    backupTime: Date.now()
  };

  let fileName = '密码备份 ' + formatterDate(Date.now(),'YYYY-MM-DD HH:mm:ss') + '.json'
  const blob = new Blob([JSON.stringify(backupFile)], {type: 'text/plain;charset=utf-8'});

  console.log('密码备份 导出文件:', fileName)
  FileSaver.saveAs(blob, fileName);
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
  let fileReader = new FileReader()
  fileReader.onload = () => {
    if (!fileReader.result) {
      return
    }
    try {
      let backupFile: BackupFile = JSON.parse(fileReader.result as string);
      fileInput.value.value = ''
      // 开始恢复文件
      startRecovery(backupFile)
    } catch (e) {
      console.error(e)
      ElNotification.error({title: '恢复失败',message: '请检查备份文件是否正确'})
    }
  }
  fileReader.readAsText(file)
}

// 开始恢复密码
const startRecovery = async (backupFile: BackupFile) => {
  console.log('密码备份,开始恢复密码')
  let passwordText,labelText
  // 检查当前主密码是否可以解锁备份文件
  let checkUnlockFile = checkPassword(passwordStore.mainPassword, backupFile.storeData.passwordData)
  console.log('密码备份, 检查当前主密码是否可以解锁备份文件:', checkUnlockFile)
  if (checkUnlockFile) {
    // 当前主密码可以解锁备份文件
    passwordText = decryptAES(passwordStore.mainPassword, backupFile.storeData.passwordData);
    labelText = decryptAES(passwordStore.mainPassword, backupFile.storeData.labelData);
  } else {
    // 当前主密码无法解锁备份文件，需要用户输入备份文件的主密码
    let mainPassword = await refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => checkPassword(mainPassword, backupFile.storeData.passwordData), backupFile.storeData.mainPasswordType)
    console.log('密码备份, 需要用户输入备份文件的主密码 mainPassword:', mainPassword)
    if (mainPassword) {
      passwordText = decryptAES(mainPassword, backupFile.storeData.passwordData);
      labelText = decryptAES(mainPassword, backupFile.storeData.labelData);
    }
  }

  if (!passwordText || !labelText){
    console.log('密码恢复失败, 请检查备份文件及主密码是否正确')
    ElNotification.error({title: '恢复失败',message: '请检查备份文件及主密码是否正确'})
    return false
  }

  // 解压缩密码列表
  recoveryPasswordArray.value = decompressionArray(JSON.parse(passwordText))
  recoveryLabelArray.value = JSON.parse(labelText)
  console.log('密码恢复, 解压缩密码列表: ', recoveryPasswordArray.value.length, recoveryLabelArray.value)

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
const coverRecovery = () => {
  console.log('密码恢复, 覆盖方式恢复 验证密码')
  refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then(() => {
    startCoverRecovery()
  })
}

// 覆盖方式恢复
const startCoverRecovery = () => {
  console.log('密码恢复, 覆盖方式恢复')
  if (passwordStore.allPasswordArray.length || passwordStore.labelArray.length) {
    console.log('密码恢复, 恢复前先备份当前数据')
    // 恢复前先备份当前数据
    backup(true);
    ElMessage.success('已为您自动备份现有密码')
  }

  console.log('密码恢复, 覆盖 数据确认：', passwordStore.allPasswordArray.length, recoveryPasswordArray.value.length, passwordStore.labelArray.length, recoveryLabelArray.value.length)

  // 覆盖现有密码列表
  passwordStore.allPasswordArray = recoveryPasswordArray.value
  // 覆盖现有标签树
  passwordStore.labelArray = recoveryLabelArray.value

  // 同步密码与标签文件
  syncPasswordAndLabel()
}

// 合并方式恢复
const mergeRecovery = () => {
  console.log('密码恢复, 合并方式恢复 验证密码')
  refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then(() => {
    startMergeRecovery()
  })
}
const startMergeRecovery = () => {
  console.log('密码恢复, 合并方式恢复')
  if (passwordStore.allPasswordArray.length || passwordStore.labelArray.length) {
    console.log('密码恢复, 恢复前先备份当前数据')
    // 恢复前先备份当前数据
    backup(true);
    ElMessage.success('已为您自动备份现有密码')
  }

  // 合并密码
  mergePassword(passwordStore.allPasswordArray, recoveryPasswordArray.value)
  // 合并标签树
  mergeLabel(passwordStore.labelArray, recoveryLabelArray.value)

  // 同步密码与标签文件
  syncPasswordAndLabel()
}

// 同步密码与标签文件
const syncPasswordAndLabel = async () => {

  console.log('密码恢复, 同步密码与标签文件')
  let passwordSync = await passwordStore.passwordManager.syncStoreData().catch((err) => err)
  console.log('密码恢复, 同步密码与标签文件 结果：', passwordSync)
  if (passwordSync.status) {
    ElMessage.success('密码恢复成功')
    visRecovery.value = false
  } else {
    ElNotification.error({title: '系统异常',message: passwordSync.message})
  }
}

defineExpose({
  backup,
  recovery
})
</script>

<template>
  <input type="file" style="display: none" ref="fileInput" @change="fileChange()" accept="application/json">
  <el-dialog
      :fullscreen="['xs', 'sm'].includes(displaySize().value)"
      v-model="visRecovery"
      width="600px"
      draggable>
    <template #header>
      <el-text size="large" style="user-select: none;">
        <span class="iconfont icon-recovery"></span>
        恢复密码 <span style="font-weight: bold">·</span> 请选择恢复方式
      </el-text>
    </template>
    <el-row>
      <el-col :sm="{span:24}" :md="{span:12}" class="recovery-col">
        <div class="recovery-type recovery-merge" @click="mergeRecovery">
          <div style="position: absolute;padding: 7px;">
            <el-tag type="success" effect="dark">推荐</el-tag>
          </div>
          <div class="icon-div">
            <span class="iconfont icon-merge"></span>
          </div>
          <el-text class="recovery-text">
            合并恢复
          </el-text>
          <div style="margin-top: 20px;padding: 10px">
            <el-text>将现有密码与备份文件中的密码合并（修改过的密码会添加备注说明）</el-text>
          </div>
        </div>
      </el-col>
      <el-col :sm="{span:24}" :md="{span:12}" class="recovery-col">
        <div class="recovery-type recovery-cover" @click="coverRecovery">
          <div class="icon-div">
            <span class="iconfont icon-cover"></span>
          </div>
          <el-text class="recovery-text">
            覆盖恢复
          </el-text>
          <div style="margin-top: 20px;padding: 10px">
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
  color: #409EFF;
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
  color: #409EFF;
  font-size: 130px;
}

.icon-cover {
  color: #F56C6C;
  font-size: 130px;
}

.recovery-col {
  padding: 15px
}

.recovery-text {
  font-size: 25px;
}
</style>