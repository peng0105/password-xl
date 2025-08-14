<!-- 快速登录提示 -->
<script lang="ts" setup>
import {decryptAES} from "@/utils/security.ts";
import {useRouter} from "vue-router";
import {displaySize, getFastLoginLink, getLocationUrl} from "@/utils/global.ts";

const router = useRouter()

// 快速登录地址
const fastLoginUrl = ref('')
// 显示快速登录提示弹窗
const visFastLogin = ref(false)

// 触发快速登录提示
const fastLoginTip = (form: any) => {
  console.log('快速登录提示')
  if (location.href.indexOf('autoLogin') !== -1 || window.electronAPI || window.androidAPI) {
    router.push('/')
    return
  }

  fastLoginUrl.value = getFastLoginLink(form)
  visFastLogin.value = true
}

// 获取快速登录表单
const getFastLoginForm = (fastLogin: string) => {
  return JSON.parse(decryptAES('password-xl', fastLogin))
}

// 返回首页
const toHome = () => {
  visFastLogin.value = false
  router.push('/')
}

defineExpose({
  fastLoginTip,
  getFastLoginForm
})
</script>

<template>

  <el-dialog v-model="visFastLogin" :append-to-body="true" :fullscreen="['xs', 'sm'].includes(displaySize().value)"
             width="700px">
    <template #header>
      <el-text size="large" style="user-select: none;">
        <span class="iconfont icon-verify"></span>
        登录成功
      </el-text>
    </template>
    <div>
      <el-text type="info">以下链接可以自动输入登录信息，您可以保存此链接以防丢失：</el-text>
    </div>
    <div style="margin-top: 5px">
      <el-input :model-value="fastLoginUrl" :rows="7" type="textarea"></el-input>
    </div>
    <div style="margin-top: 10px">
      <el-text type="info">该链接为password-XL首页地址，您可以收藏：</el-text>
    </div>
    <div style="margin-top: 5px">
      <el-input :model-value="getLocationUrl()" readonly></el-input>
    </div>
    <template #footer>
      <el-button type="primary" @click="toHome">好的</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.icon-verify {
  font-size: 110%;
  color: #409EFF;
  margin-right: 5px;
}
</style>