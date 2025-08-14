<script lang="ts" setup>

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {RespData} from "@/types";
import {useRouter} from "vue-router";
import {browserFingerprint, encryptAES} from "@/utils/security.ts";
import {DatabaseForElectron} from "@/database/DatabaseForElectron.ts";

const passwordStore = usePasswordStore()
const router = useRouter()

const useLocalLogin = async () => {
  console.log('electron 点击登录')
  let database = new DatabaseForElectron();

  // 初始化密码管理器
  passwordStore.passwordManager.login(database).then((resp: RespData) => {
    if (!resp.status) {
      console.log('electron 登录失败：', resp)
      ElNotification.error({title: '登录失败', message: resp.message})
      return
    }

    // 使用浏览器指纹加密登录信息
    // 此刻想法：因为此时刚刚登录还没有主密码，因此将登录信息用浏览器指纹加密后保存在session中，如果存在pinia中页面一刷新就没了，用户体验不好
    let fingerprint = browserFingerprint()
    let loginForm = {loginType: 'electron'}
    let ciphertext = encryptAES(fingerprint, JSON.stringify(loginForm));
    // 保存到sessionStorage
    sessionStorage.setItem('loginForm', ciphertext)

    console.log('electron 登录 跳转首页')
    router.push('/')
  }).catch(() => null)
}
defineExpose({
  useLocalLogin
})
</script>

<template>

</template>

<style scoped>

</style>