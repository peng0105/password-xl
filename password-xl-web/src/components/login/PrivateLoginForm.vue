<script lang="ts" setup>

import {PrivateLoginForm} from "@/types/index.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {RespData} from "@/types";
import {useRoute} from "vue-router";
import {useLoginStore} from "@/stores/LoginStore.ts";
import {browserFingerprint, encryptAES} from "@/utils/security.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {DatabaseForPrivate} from "@/database/DatabaseForPrivate.ts";

const route = useRoute()
const passwordStore = usePasswordStore();
const loginStore = useLoginStore()
const refStore = useRefStore()


// 登录表单Ref
const formRef = ref()

// 登录表单
const form: PrivateLoginForm = reactive({
  serverUrl: '',
  username: '',
  password: '',
})

// 表单校验规则
const formRules = reactive({
  serverUrl: [{required: true, message: '请输入服务地址', trigger: 'blur'}],
  username: [{required: true, message: '请输入用户名', trigger: 'blur'}],
  password: [{required: true, message: '请输入密码', trigger: 'blur'}]
})

// 登录
const login = async (formRef: any) => {
  console.log('private 点击登录')
  // 参数校验
  await formRef.validate(async (valid: boolean) => {
    if (!valid) {
      return
    }
    loginStore.logging = true
    try {
      // 登录
      let database = new DatabaseForPrivate()
      let result = await database.login(form)
      console.log('private 登录 数据库登录结果：', result)
      if (!result.status) {
        loginStore.logging = false
        ElNotification.error({title: '登录失败', message: result.message})
        return
      }
      loginStore.loginForm = form

      // 初始化密码管理器
      console.log('private 登录 初始化密码管理器')
      passwordStore.passwordManager.login(database).then((resp: RespData) => {
        if (!resp.status) {
          loginStore.logging = false
          console.log('private 登录 登录失败: ', resp)
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
        console.log('private 登录 触发快速登录提示')
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
  if (route.query.type === 'private' && route.query.autoLogin) {
    let autoLogin = refStore.fastLoginRef.getFastLoginForm(route.query.autoLogin as string)
    form.serverUrl = autoLogin.serverUrl || ''
    form.username = autoLogin.username || ''
    form.password = autoLogin.password || ''
  } else {
    form.serverUrl = (route.query.serverUrl || '') + 'http://127.0.0.1:8080';
    form.username = (route.query.username || '') + ''
    form.password = (route.query.password || '') + ''
  }
}

// 是否支持查看密码
const showPassword = () => {
  // 非自动登录链接支持
  return !(route.query.autoLogin && route.query.type === 'private')
}

initForm()

</script>

<template>
  <div class="login-title">
    <img alt="" src="../../assets/images/login/private.png"> 私有服务登录
  </div>
  <TextLine class="input-login-line hidden-xs-only" text="请输入登录信息"></TextLine>
  <el-row class="login-form-row">
    <el-col :sm="{span: 20, offset: 2}" :xs="{span: 24}">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="服务地址" prop="serverUrl" required>
          <el-input v-model="form.serverUrl" clearable placeholder="http://127.0.0.1:8080"></el-input>
        </el-form-item>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" clearable placeholder="用户名"></el-input>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" :show-password="showPassword()" placeholder="密码"
                    type="password" @keyup.enter.native="login(formRef)"></el-input>
        </el-form-item>
        <el-form-item>
          <el-button class="login-btn" plain round type="primary" @click="login(formRef)">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
      <div class="register-guide">
        <el-link :underline="false" href="https://github.com/peng0105/password-xl/wiki/%E5%90%8E%E7%AB%AF%E9%A1%B9%E7%9B%AE%E9%83%A8%E7%BD%B2%E6%96%87%E6%A1%A3%E2%80%90docker"
                 target="_blank"
                 type="primary">私有部署说明文档
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

.register-guide {
  text-align: right
}
</style>