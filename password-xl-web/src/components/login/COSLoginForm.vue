<script lang="ts" setup>

import {COSLoginForm} from "@/types/index.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {RespData} from "@/types";
import {useRoute} from "vue-router";
import {DatabaseForCOS} from "@/database/DatabaseForCOS.ts";
import {useLoginStore} from "@/stores/LoginStore.ts";
import {browserFingerprint, encryptAES} from "@/utils/security.ts";
import {useRefStore} from "@/stores/RefStore.ts";

const route = useRoute()
const passwordStore = usePasswordStore();
const loginStore = useLoginStore()
const refStore = useRefStore()

// 登录表单Ref
const formRef = ref()

// 登录表单
const form: COSLoginForm = reactive({
  region: '',
  secretId: '',
  secretKey: '',
  bucket: '',
})

// 表单校验规则
const formRules = reactive({
  region: [{required: true, message: '请输入region', trigger: 'blur'}],
  secretId: [{required: true, message: '请输入secretId', trigger: 'blur'}],
  secretKey: [{required: true, message: '请输入secretKey', trigger: 'blur'}],
  bucket: [{required: true, message: '请输入bucket', trigger: 'blur'}]
})

// 登录
const login = async (formRef: any) => {
  console.log('cos 点击登录')
  // 参数校验
  await formRef.validate(async (valid: boolean) => {
    if (!valid) {
      return
    }
    loginStore.logging = true
    try {
      // 登录
      let database = new DatabaseForCOS()
      let result = await database.login(form)
      console.log('cos 登录 数据库登录结果：', result)
      if (!result.status) {
        loginStore.logging = false
        ElNotification.error({title: '登录失败', message: result.message})
        return
      }
      loginStore.loginForm = form

      // 初始化密码管理器
      console.log('cos 登录 初始化密码管理器')
      passwordStore.passwordManager.login(database).then((resp: RespData) => {
        if (!resp.status) {
          loginStore.logging = false
          console.log('cos 登录 登录失败: ', resp)
          ElNotification.error({title: '登录失败', message: resp.message})
          return
        }

        // 使用浏览器指纹加密登录信息
        // 此刻想法：因为此时刚刚登录还没有主密码，因此将登录信息用浏览器指纹加密后保存在session中，如果存在pinia中页面一刷新就没了，用户体验不好
        let fingerprint = browserFingerprint()
        let loginForm = JSON.parse(JSON.stringify(form))
        loginForm.loginType = loginStore.loginType
        let ciphertext = encryptAES(fingerprint, JSON.stringify(loginForm));
        // 保存到sessionStorage
        sessionStorage.setItem('loginForm', ciphertext)
        console.log('cos 登录 触发快速登录提示')
        refStore.fastLoginRef.fastLoginTip(loginForm)
      }).catch(() => {
        loginStore.logging = false
      })
    } catch (e) {
      loginStore.logging = false
    }
  })
}

// 从url初始化登录form
const initForm = () => {
  if (route.query.type === 'cos' && route.query.autoLogin) {
    let autoLogin = refStore.fastLoginRef.getFastLoginForm(route.query.autoLogin as string)
    form.region = autoLogin.region || ''
    form.secretId = autoLogin.secretId || ''
    form.secretKey = autoLogin.secretKey || ''
    form.bucket = autoLogin.bucket || ''
  } else {
    form.region = (route.query.region || '') + '';
    form.secretId = (route.query.secretId || '') + ''
    form.secretKey = (route.query.secretKey || '') + ''
    form.bucket = (route.query.bucket || '') + ''
  }
}

// 是否支持查看密码
const showPassword = () => {
  // 非自动登录链接支持
  return !(route.query.autoLogin && route.query.type === 'cos')
}

initForm()

</script>

<template>
  <div class="login-title">
    <img alt="" src="../../assets/images/login/cos.png"> 腾讯云COS登录
  </div>
  <TextLine class="input-login-line" text="请输入登录信息"></TextLine>
  <el-row class="login-form-row">
    <el-col :sm="{span: 20, offset: 2}" :xs="{span: 24}">
      <el-form ref="formRef" :model="form" :rules="formRules">
        <el-form-item prop="region">
          <el-input v-model="form.region" clearable placeholder="region"></el-input>
        </el-form-item>
        <el-form-item prop="accessKeyId">
          <el-input v-model="form.secretId" clearable placeholder="secretId"></el-input>
        </el-form-item>
        <el-form-item prop="accessKeySecret">
          <el-input v-model="form.secretKey" :show-password="showPassword()" clearable placeholder="secretKey"
                    type="password"></el-input>
        </el-form-item>
        <el-form-item prop="bucket">
          <el-input v-model="form.bucket" clearable placeholder="bucket"
                    @keyup.enter.native="login(formRef)"></el-input>
        </el-form-item>
      </el-form>
      <el-button class="login-btn" plain round type="primary" @click="login(formRef)">
        登 录
      </el-button>
      <div class="register-guide">
        <el-link :underline="false" href="https://github.com/peng0105/password-xl/wiki/%E8%85%BE%E8%AE%AF%E4%BA%91COS%E6%B3%A8%E5%86%8C%E6%8C%87%E5%BC%95"
                 target="_blank"
                 type="primary">腾讯云COS注册指引
        </el-link>
      </div>
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
  width: 35px;
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

.register-guide {
  text-align: right
}
</style>