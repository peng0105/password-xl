<!--查看密码-->
<script setup lang="ts">
import {copyText, displaySize} from "@/utils/global.ts";
import {Password} from "@/types";

// 查看密码弹窗
const viewPassword = reactive({
  alertVisible: false,
  content: '',
  title: ''
})

const showPassword = (password: Password) => {
  console.log('查看密码弹窗')
  viewPassword.content = password.password
  viewPassword.title = password.title
  viewPassword.alertVisible = true
}

defineExpose({
  showPassword
})
</script>

<template>
  <!-- 查看密码弹窗 -->
  <el-dialog append-to-body v-model="viewPassword.alertVisible" :width="['xs', 'sm'].includes(displaySize().value)?'95%':'40%'">
    <template #header>
      <el-text size="large" style="user-select: none;">
        <span class="iconfont icon-show-password"></span>
        {{ viewPassword.title }}
      </el-text>
    </template>
    <el-input type="textarea" :rows="10" v-model="viewPassword.content" readonly></el-input>
    <template #footer>
      <el-text type="info" class="password-length-tip">
        <span class="iconfont icon-info"></span>
        密码长度大于40会以弹框形式展示密码
      </el-text>
      <el-button plain type="success" @click="copyText(viewPassword.content);viewPassword.alertVisible = false">一键复制</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>

.password-length-tip {
  position: absolute;
  bottom: 0;
  left: 0;
  margin: 10px;
}

</style>