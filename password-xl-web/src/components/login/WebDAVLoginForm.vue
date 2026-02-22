<script lang="ts" setup>

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {RespData, WebDAVLoginForm} from "@/types";
import {useRoute} from "vue-router";
import {useLoginStore} from "@/stores/LoginStore.ts";
import {browserFingerprint, encryptAES} from "@/utils/security.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {DatabaseForWebDAV} from "@/database/DatabaseForWebDAV.ts";

const route = useRoute()
const passwordStore = usePasswordStore();
const loginStore = useLoginStore()
const refStore = useRefStore()

const formRef = ref()

const form: WebDAVLoginForm = reactive({
  serverUrl: '',
  username: '',
  password: '',
  rootPath: '/password-xl',
})

const formRules = reactive({
  serverUrl: [{required: true, message: '请输入服务地址', trigger: 'blur'}],
  username: [{required: true, message: '请输入用户名', trigger: 'blur'}],
  password: [{required: true, message: '请输入密码', trigger: 'blur'}],
})

const login = async (formRef: any) => {
  await formRef.validate(async (valid: boolean) => {
    if (!valid) {
      return
    }
    loginStore.logging = true
    try {
      const database = new DatabaseForWebDAV()
      const result = await database.login(form)
      if (!result.status) {
        loginStore.logging = false
        ElNotification.error({title: '登录失败', message: result.message})
        return
      }

      loginStore.loginForm = form
      passwordStore.passwordManager.login(database).then((resp: RespData) => {
        if (!resp.status) {
          loginStore.logging = false
          ElNotification.error({title: '登录失败', message: resp.message})
          return
        }

        const fingerprint = browserFingerprint()
        const loginForm = JSON.parse(JSON.stringify(form))
        loginForm.loginType = loginStore.loginType
        const ciphertext = encryptAES(fingerprint, JSON.stringify(loginForm));
        sessionStorage.setItem('loginForm', ciphertext)
        refStore.fastLoginRef.fastLoginTip(loginForm)
      }).catch(() => {
        loginStore.logging = false
      })
    } catch (_e) {
      loginStore.logging = false
    }
  })
}

const initForm = () => {
  if (route.query.type === 'webdav' && route.query.autoLogin) {
    const autoLogin = refStore.fastLoginRef.getFastLoginForm(route.query.autoLogin as string)
    form.serverUrl = autoLogin.serverUrl || ''
    form.username = autoLogin.username || ''
    form.password = autoLogin.password || ''
    form.rootPath = autoLogin.rootPath || '/password-xl'
  } else {
    form.serverUrl = (route.query.serverUrl || '') + ''
    form.username = (route.query.username || '') + ''
    form.password = (route.query.password || '') + ''
    form.rootPath = (route.query.rootPath || '/password-xl') + ''
  }
}

const showPassword = () => {
  return !(route.query.autoLogin && route.query.type === 'webdav')
}

initForm()
</script>

<template>
  <div class="login-title">
    <img alt="" src="../../assets/images/login/private.png"> WebDAV登录
  </div>
  <TextLine class="input-login-line hidden-xs-only" text="请输入登录信息"></TextLine>
  <el-row class="login-form-row">
    <el-col :sm="{span: 20, offset: 2}" :xs="{span: 24}">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="服务地址" prop="serverUrl" required>
          <el-input v-model="form.serverUrl" clearable placeholder="https://dav.example.com"></el-input>
        </el-form-item>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" clearable placeholder="用户名"></el-input>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" :show-password="showPassword()" placeholder="密码" type="password"
                    @keyup.enter.native="login(formRef)"></el-input>
        </el-form-item>
        <el-form-item label="根目录" prop="rootPath">
          <el-input v-model="form.rootPath" clearable placeholder="/password-xl"></el-input>
        </el-form-item>
        <el-form-item>
          <el-button class="login-btn" plain round type="primary" @click="login(formRef)">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </el-col>
  </el-row>
</template>

<style scoped>
.login-btn {
  width: 100%;
  margin: 0 auto 15px auto;
}

.login-title {
  text-align: center;
  font-size: 24px;
  color: #555;
  width: auto;
  backdrop-filter: blur(50px);
  padding: 5px 15px;
}

.login-title img {
  width: 25px;
  position: relative;
  top: 3px;
}

.input-login-line {
  margin-top: 25px;
  margin-bottom: 20px
}

.login-form-row {
  margin-top: 25px
}
</style>
