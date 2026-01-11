<script lang="ts" setup>

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {comparePassword, displaySize, incrId} from "@/utils/global.ts";
import {Password, PasswordStatus} from "@/types";
import {extractPasswordApi} from "@/api/password-xl-api.ts";
// 导入确认密码列表
const passwordTableRef = ref()

const aiImportVis = ref(false)
// 导入步骤 1.填写信息 2.解析中 3.确认导入
const step = ref(1)

const passwordStore = usePasswordStore()
const refStore = useRefStore()

const passwordText = ref('')

// 存储解析后的密码数组
const importPasswords: Ref<Array<Password>> = ref([]);

// 确认导入已选中密码与标签
const affirmImport = () => {
  console.log('AI导入 确认导入已选中密码与标签')
  // 获取选中的密码列表
  const selectedPasswords: Password[] = passwordTableRef.value.getSelectionRows();

  if (!selectedPasswords.length) {
    console.log('AI导入 未选择密码')
    ElMessage.warning('请选择要导入的密码')
    return
  }

  console.log('AI导入 验证身份')
  refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then(() => {
    console.log('AI导入 确认开始导入')
    affirmImportPass()
  })
}


// 确认导入已选中密码与标签,主密码验证通过
const affirmImportPass = () => {
  try {
    // 获取选中的密码列表
    const selectedPasswords: Password[] = passwordTableRef.value.getSelectionRows();

    // 筛选已选中的密码
    const selectedPasswordIds: number[] = selectedPasswords.map(password => password.id);
    const readyToImportPasswords: Password[] = importPasswords.value.filter(password => selectedPasswordIds.includes(password.id));
    console.log('要导入的密码：', readyToImportPasswords);

    // 合并密码和标签
    mergePasswords(passwordStore.allPasswordArray, readyToImportPasswords);

    // 同步密码数据
    passwordStore.passwordManager.syncStoreData()
    aiImportVis.value = false
    importPasswords.value = []
    passwordText.value = ''
    ElNotification.success('导入成功')
  } catch (e) {
    console.error(e)
    ElNotification.error('导入失败')
  }
}

// 合并密码
const mergePasswords = (passwordArray: Password[], mergePasswordArray: Password[]) => {
  mergePasswordArray.forEach(mergePassword => {
    const existingPassword = passwordArray.find(password => comparePassword(password, mergePassword));
    if (existingPassword) {
      existingPassword.status = PasswordStatus.NORMAL
    } else {
      // 密码不存在，直接添加
      passwordArray.push(mergePassword);
    }
  });
}

// 开始解析密码
const startAnalysis = () => {
  if (!passwordText.value) {
    ElMessage.warning('请输入密码信息')
    return
  }
  console.log('AI解析，开始解析密码')
  importPasswords.value = []
  step.value = 2

  extractPasswordApi(passwordText.value, true).then((resp: any) => {
    step.value = 3
    console.log('AI解析，解析密码完成')
    const passwordArray = JSON.parse(resp)
    for (let i = 0; i < passwordArray.length; i++) {
      importPasswords.value.push({
        id: incrId(),
        title: passwordArray[i].name,
        address: passwordArray[i].address,
        username: passwordArray[i].username,
        password: passwordArray[i].password,
        remark: passwordArray[i].remark,
        addTime: Date.now(),
        updateTime: Date.now(),
        deleteTime: 0,
        favoriteTime: 0,
        favorite: false,
        customFields: [],
        labels: [],
        status: PasswordStatus.NORMAL,
        bgColor: '',
      })
    }
    nextTick(() => {
      // 全选密码列表
      console.log('AI导入 全选密码列表')
      passwordTableRef.value.toggleAllSelection()
    })
  }).catch((err) => {
    step.value = 1
    ElNotification.error(err)
  })
}

// 开始解析按钮是否禁用判断
const analysisBtnDis = (): boolean => {
  return !passwordText.value
}

// 导入按钮是否禁用判断
const importBtnDis = (): boolean => {
  if (!passwordTableRef.value) {
    return true
  }
  const selectedPasswords: Password[] = passwordTableRef.value.getSelectionRows();
  return !selectedPasswords.length
}

// 是否可选中导入判断
const selectCheck = (row: any) => {
  return !passwordStore.passwordArray.find(password => comparePassword(password, row));
}

const batchImport = () => {
  step.value = 1
  aiImportVis.value = true
}

defineExpose({
  batchImport
})
</script>

<template>
  <el-dialog v-model="aiImportVis" title="AI批量导入" top="10vh"
      :width="['xs','sm','md'].includes(displaySize().value)?'95%':'70%'">
    <div v-if="step === 1">
      <el-input type="textarea" class="password-text-input" v-model="passwordText" placeholder="请粘贴密码内容，例如：
      阿里云ECS 10.12.3.45 root/P@x92Q5m#jjL
      2026年临时用的"></el-input>
    </div>
    <div v-if="step === 2" v-loading="true" element-loading-text="正在解析..." style="height: 55vh"></div>
    <div v-if="step === 3">
      <el-table ref="passwordTableRef" :data="importPasswords" height="55vh">
        <el-table-column type="selection" :selectable="selectCheck" width="55"></el-table-column>
        <el-table-column width="55">
          <template #default="scope">
            <el-tooltip v-if="selectCheck(scope.row)" content="可导入" placement="top">
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
      <el-button v-if="step === 1" :disabled="analysisBtnDis()" type="primary" @click="startAnalysis">开始解析</el-button>
      <el-button v-if="step === 3" :disabled="importBtnDis()" type="primary" @click="affirmImport">确认导入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
:deep(.password-text-input textarea) {
  height: 55vh !important;
}

</style>