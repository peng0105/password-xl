<script setup lang="ts">

import {DatabaseForLocal} from "@/database/DatabaseForLocal.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {RespData} from "@/types";
import {useRouter} from "vue-router";
import {browserFingerprint, checkPassword, decryptAES} from "@/utils/security.ts";

const passwordStore = usePasswordStore()
const router = useRouter()

const useLocalLogin = async (localFileType: string) => {
  console.log('local 登录：', localFileType)
  let database = new DatabaseForLocal();
  await database.login({localFileType: localFileType})

  // 初始化密码管理器
  passwordStore.passwordManager.login(database).then((resp: RespData) => {
    if (!resp.status) {
      console.log('local 登录 登录失败：', resp)
      ElNotification.error({title: '登录失败', message: resp.message})
      return
    }

    // 自动解锁（本地登陆版）
    let mainPasswordCiphertext = localStorage.getItem('mainPassword');
    if (mainPasswordCiphertext) {
      console.log('使用自动解锁')
      let storeData = passwordStore.passwordManager.getStoreData()
      if (storeData) {
        let mainPassword = decryptAES(browserFingerprint(), mainPasswordCiphertext);
        if (checkPassword(mainPassword, storeData.passwordData)) {
          passwordStore.passwordManager.unlock(mainPassword)
        }
      }
    }
    console.log('local 登录 跳转首页')
    router.push('/')
  }).catch(() => null)
}

// 是否支持本地存储
const supportLocalFile = () => {
  return !!window.showOpenFilePicker
}
</script>

<template>
  <div>
    <div class="login-title">
      <img alt="" src="../../assets/images/login/local.png"> 本地存储
    </div>
    <div v-if="supportLocalFile()">
      <TextLine class="input-login-line" text="请选择"></TextLine>
      <el-row style="padding: 10px">
        <el-col :sm="{span:24}" :md="{span:12}" class="local-type-col">
          <div class="local-type local-create" @click="useLocalLogin('create')">
            <div class="icon-div">
              <span class="iconfont icon-create"></span>
            </div>
            <el-text class="local-type-text">
              创建存储文件
            </el-text>
            <div style="margin-top: 20px;padding: 10px">
              <el-text type="info">第一次使用需要先创建存储文件</el-text>
            </div>
          </div>
        </el-col>
        <el-col :sm="{span:24}" :md="{span:12}" class="local-type-col">
          <div class="local-type local-open" @click="useLocalLogin('open')">
            <div class="icon-div">
              <span class="iconfont icon-open-file"></span>
            </div>
            <el-text class="local-type-text">
              打开存储文件
            </el-text>
            <div style="margin-top: 20px;padding: 10px">
              <el-text type="info">已有存储文件，点我打开</el-text>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>
    <div v-else style="text-align: center;margin: 100px 0">
      <el-text size="large" type="danger">您的浏览器不支持本地存储，您可以在电脑版edge、chrome等浏览器使用本地存储功能</el-text>
    </div>
  </div>
</template>

<style scoped>
.login-title {
  text-align: center;
  font-size: 24px;
  color: #555;
  width: auto;
  backdrop-filter: blur(50px);
  padding: 5px 15px;
}

.login-title img {
  width: 35px;
  position: relative;
  top: 6px;
}

.input-login-line {
  margin-top: 25px;
  margin-bottom: 10px
}

.local-type {
  height: 300px;
  width: 100%;
  border-radius: 5px;
  text-align: center;
  display: grid;
}

.local-create {
  background-color: rgba(198, 226, 255, 0.7);
  cursor: pointer;
}

.local-create:hover {
  background-color: rgba(165, 210, 255, 0.8);
}

.local-open {
  background-color: rgba(209, 237, 196, 0.7);
  cursor: pointer;
}

.local-open:hover {
  background-color: rgba(179, 225, 157, 0.8);
}

.local-type-col {
  padding: 15px
}

.icon-div{
  margin-top: 20px;
}

.local-type-text {
  font-size: 25px;
}

.icon-create,.icon-open-file{
  font-size: 100px;
  color: #999;
}

.icon-create{
  color: #409EFF;
}

.icon-open-file{
  color: #67C23A;
}
</style>