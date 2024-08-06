<!--注销账号组件-->
<script setup lang="ts">

import {useRefStore} from "@/stores/RefStore.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {displaySize} from "@/utils/global.ts";

const refStore = useRefStore()
const passwordStore = usePasswordStore()

const alertVis = ref(false)

// 注销账户（组件入口）
const showCloseAccount = () => {
  console.log('准备注销账户')
  alertVis.value = true
}

// 注销账户
const closeAccount = () => {
  console.log('准备注销账户 验证密码')
  refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then(() => {
    console.log('准备注销账户 发起注销')
    passwordStore.passwordManager.closeAccount().then((resp) => {
      console.log('准备注销账户 结果：', resp.status)
      if (resp.status) {
        ElNotification.success({title: '账户注销成功',message: '欢迎再次使用！'})
        console.log('准备注销账户 退出登录')
        passwordStore.logout()
      } else {
        ElNotification.error({title: '账户注销失败',message: resp.message})
      }
    })
  })
}

defineExpose({showCloseAccount})
</script>

<template>
  <el-dialog
      :width="['xs'].includes(displaySize().value)?'95%':'400px'"
      v-model="alertVis">
    <template #header>
      <el-text size="large" style="user-select: none;">
        <span class="iconfont icon-risk"></span>
        注销账户
      </el-text>
    </template>
    <el-alert type="error" :closable="false">注销账户将永久删除所有密码和标签且不可恢复，确认注销账户吗？</el-alert>
    <template #footer>
      <el-button type="primary" plain @click="alertVis = false">我点错了</el-button>
      <el-button type="danger" @click="closeAccount">确认注销</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.icon-risk {
  color: #F56C6C;
  margin-right: 5px;
  font-size: 110%;
}
</style>