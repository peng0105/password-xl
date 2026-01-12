<script lang="ts" setup>

import {copyText, getFastLoginLink} from "@/utils/global.ts";
import {useLoginStore} from "@/stores/LoginStore.ts";

const loginStore = useLoginStore()

const isElectron = () => {
  return window.electronAPI && window.electronAPI.setTopic
}
const isAndroid = () => {
  return window.androidAPI && window.androidAPI.setTopic
}
</script>

<template>
  <el-form label-width="80px">
    <template v-if="loginStore.loginType === 'oss'">
      <div style="text-align: center;margin-bottom: 5px;width: 100%">
        <img alt="" class="login-type-image" src="@/assets/images/login/oss.png" style="height: 28px">
        <el-text style="font-size: 24px">阿里云OSS</el-text>
      </div>
      <el-divider></el-divider>
      <div>
        <el-form-item label="region">
          <el-input :model-value="loginStore.loginForm.region" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.region)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="accessKeyId">
          <el-input :model-value="loginStore.loginForm.accessKeyId" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.accessKeyId)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="accessKeySecret">
          <el-input :model-value="loginStore.loginForm.accessKeySecret" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.accessKeySecret)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="bucket">
          <el-input :model-value="loginStore.loginForm.bucket" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.bucket)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item v-if="!isElectron() && !isAndroid()" label="快速登录链接">
          <el-input :model-value="getFastLoginLink(loginStore.loginForm)" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(getFastLoginLink(loginStore.loginForm))">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
      </div>
    </template>
    <template v-else-if="loginStore.loginType === 'cos'">
      <div style="text-align: center;margin-bottom: 5px;width: 100%">
        <img alt="" class="login-type-image" src="@/assets/images/login/cos.png" style="height: 28px">
        <el-text style="font-size: 24px">腾讯云COS</el-text>
      </div>
      <el-divider></el-divider>
      <div>
        <el-form-item label="region">
          <el-input :model-value="loginStore.loginForm.region" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.region)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="secretId">
          <el-input :model-value="loginStore.loginForm.secretId" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.secretId)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="secretKey">
          <el-input :model-value="loginStore.loginForm.secretKey" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.secretKey)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="bucket">
          <el-input :model-value="loginStore.loginForm.bucket" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.bucket)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item v-if="!isElectron() && !isAndroid()" label="快速登录链接">
          <el-input :model-value="getFastLoginLink(loginStore.loginForm)" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(getFastLoginLink(loginStore.loginForm))">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
      </div>
    </template>
    <template v-else-if="loginStore.loginType === 'private'">
      <div style="text-align: center;margin-bottom: 15px;width: 100%">
        <img alt="" class="login-type-image" src="@/assets/images/login/private.png" style="height: 28px">
        <el-text style="font-size: 24px">私有服务</el-text>
      </div>
      <el-divider></el-divider>
      <div>
        <el-form-item label="服务地址">
          <el-input :model-value="loginStore.loginForm.serverUrl" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.serverUrl)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="用户名">
          <el-input :model-value="loginStore.loginForm.username" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.username)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="密码">
          <el-input :model-value="loginStore.loginForm.password" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(loginStore.loginForm.password)">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item v-if="!isElectron() && !isAndroid()" label="快速登录链接">
          <el-input :model-value="getFastLoginLink(loginStore.loginForm)" :readonly="true">
            <template #append>
              <el-button class="copy-btn" @click="copyText(getFastLoginLink(loginStore.loginForm))">
                <span class="iconfont icon-copy"></span>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
      </div>
    </template>
    <template v-else>
      <div style="text-align: center;margin-top: 50px;width: 100%">
        <img alt="" class="login-type-image" src="@/assets/images/login/local.png" style="height: 130px">
        <div style="margin-top: 25px">
          <el-text style="font-size: 22px">您正在使用本地文件存储</el-text>
        </div>
      </div>
      <div style="padding: 0 50px 0 20px">
        <div style="text-align: center;margin-top: 30px;width: 100%">
          <el-text type="info">没有更多信息</el-text>
        </div>
      </div>
    </template>
  </el-form>
</template>

<style scoped>
.login-info .copy-btn:hover {
  color: #409EFF !important;
}

.login-type-image {
  position: relative;
  top: 4px;
  margin-right: 13px;
}
</style>