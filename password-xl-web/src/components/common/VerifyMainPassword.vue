<!--验证主密码组件-->
<script setup lang="ts">

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {MainPasswordType, ServiceStatus} from "@/types";
import {useRouter} from "vue-router";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {displaySize} from "@/utils/global.ts";

const router = useRouter()
const passwordStore = usePasswordStore()
const settingStore = useSettingStore()

// 密码输入框Ref
const passwordInputRef = ref()
// 表单Ref
const formRef = ref()
// 组件是否显示
const visVerify = ref(false)
// 验证通过后回调
const resolveFun = ref<Function | null>(null)
// 组件模式 getAndVerify.获取并验证主密码 verifyAndUnlock.验证并解锁
const modelType = ref('')
// 密码类型
const mainPasswordType: Ref<MainPasswordType> = ref(JSON.parse(JSON.stringify(passwordStore.mainPasswordType)))
// 验证方法
const getVerifyFunction: Ref<Function | undefined> = ref()

// 密码表单
const form = reactive({
  mainPassword: ''
})

// 密码表单校验规则
const formRules = reactive({
  mainPassword: [
    {required: true, message: '请输入主密码', trigger: 'change'}
  ]
})

// 获取并验证主密码（组件入口1）
const getAndVerify = (verifyFun: Function, passwordType?: MainPasswordType): Promise<string> => {
  console.log('获取并验证主密码 passwordType:', passwordType)
  // 主密码类型
  mainPasswordType.value = passwordType || passwordStore.mainPasswordType
  // 组件模式设置为获取并验证主密码
  modelType.value = 'getAndVerify'
  // 验证方法
  getVerifyFunction.value = verifyFun
  if (passwordType === MainPasswordType.STANDARD) {
    // 重置主密码录入框
    formRef.value?.resetFields();
  }
  form.mainPassword = ''
  // 显示组件
  visVerify.value = true

  // 设置回调方法
  return new Promise((resolve) => resolveFun.value = resolve)
}

// 验证密码并解锁（组件入口2）
const verifyAndUnlock = (): Promise<boolean> => {
  console.log('验证密码并解锁')
  // 主密码类型
  mainPasswordType.value = passwordStore.mainPasswordType
  // 组件模式设置为验证并解锁
  modelType.value = 'verifyAndUnlock'
  if (passwordStore.mainPasswordType === MainPasswordType.STANDARD) {
    // 重置主密码录入框
    formRef.value?.resetFields();
  }

  form.mainPassword = ''
  // 显示组件
  visVerify.value = true
  // 设置回调方法
  return new Promise(async (resolve) => resolveFun.value = resolve)
}

// 标准密码输入确认
const alertConfirm = (formRef: any) => {
  console.log('标准密码输入确认')
  // 校验密码表单
  formRef.validate((valid: any) => {
    if (!valid) {
      // 校验未通过, 让输入框获得焦点
      passwordInputRef.value.focus()
      console.log('主密码必填校验未通过')
      return
    }

    if (modelType.value === 'getAndVerify') {
      getAndVerifyFun()
    } else if (modelType.value === 'verifyAndUnlock') {
      verifyAndUnlockFun()
    }
  })
}

// 手势密码绘制完成
const gestureComplete = (mainPassword: string) => {
  console.log('手势密码绘制完成')
  form.mainPassword = mainPassword
  if (modelType.value === 'getAndVerify') {
    getAndVerifyFun()
  } else if (modelType.value === 'verifyAndUnlock') {
    verifyAndUnlockFun()
  }
}

// 获取并验证主密码回调方法
const getAndVerifyFun = () => {
  console.log('获取并验证主密码回调 验证方法是否存在：', !!getVerifyFunction.value)
  // 验证方法不存在则不验证正确性直接返回
  if (!getVerifyFunction.value) {
    visVerify.value = false;
    // 回调方法
    if (resolveFun.value) resolveFun.value(form.mainPassword)
    return
  }

  // 调用验证密码方法
  try {
    let verifyResult = getVerifyFunction.value(form.mainPassword)
    if (!verifyResult) {
      console.log('验证失败')
      ElMessage.error('验证失败')
      return;
    }
  } catch (e) {
    console.error('验证失败', e)
    ElMessage.error('验证失败')
    return;
  }
  // 验证通过
  visVerify.value = false;
  // 回调方法
  if (resolveFun.value) resolveFun.value(form.mainPassword)
}

// 验证并解锁回调方法
const verifyAndUnlockFun = () => {
  console.log('验证并解锁回调方法')
  let verifyResult = passwordStore.passwordManager.verifyPassword(form.mainPassword)
  if (!verifyResult) {
    console.log('验证失败')
    ElMessage.error('验证失败')
    return;
  }
  let unlockResult = passwordStore.passwordManager.unlock(form.mainPassword)
  if (!unlockResult) {
    console.log('验证失败')
    ElMessage.error('验证失败')
    return;
  }
  // 验证通过
  visVerify.value = false

  // 回调方法
  if (resolveFun.value) resolveFun.value(form.mainPassword)
}

// 跳转登录页
const toLogin = () => {
  console.log('跳转登录页')
  visVerify.value = false
  router.push('/login')
}

// 弹框打开时让输入框获得焦点
const onOpen = () => {
  if (mainPasswordType.value === MainPasswordType.STANDARD) {
    passwordInputRef.value?.focus()
  }
}

// 是否显示手势线
const showGesture = (): boolean => {
  if (passwordStore.serviceStatus === ServiceStatus.NO_LOGIN) {
    let showGesture = localStorage.getItem('showGesture')
    if (showGesture === 'false') {
      return false
    }
  }
  return settingStore.setting.verifyShowGesture
}

defineExpose({
  getAndVerify,
  verifyAndUnlock
})
</script>

<template>
  <el-dialog
      top="20vh"
      :width="['xs', 'sm'].includes(displaySize().value)?'95%':'400px'"
      v-model="visVerify"
      :close-on-click-modal="passwordStore.serviceStatus !== ServiceStatus.NO_LOGIN"
      :close-on-press-escape="passwordStore.serviceStatus !== ServiceStatus.NO_LOGIN"
      :show-close="passwordStore.serviceStatus !== ServiceStatus.NO_LOGIN"
      @opened="onOpen"
      @open="formRef?.resetFields()"
  >
    <template #header>
      <el-text size="large" style="user-select: none;">
        <span class="iconfont icon-verify"></span>
        <template v-if="passwordStore.serviceStatus === ServiceStatus.NO_LOGIN">自动登录<span style="font-weight: bold"> · </span></template>验证主密码
      </el-text>
    </template>
    <div style="margin: 20px" v-if="mainPasswordType === MainPasswordType.STANDARD">
      <el-form
          ref="formRef"
          @submit.native.prevent
          :model="form"
          :rules="formRules">
        <el-form-item prop="mainPassword">
          <el-input
              ref="passwordInputRef"
              type="password"
              show-password
              autocomplete="new-password"
              @keyup.enter.native="alertConfirm(formRef)"
              v-model="form.mainPassword"
              placeholder="请输入主密码"
          ></el-input>
        </el-form-item>
      </el-form>
    </div>
    <div style="margin: 20px" v-if="mainPasswordType === MainPasswordType.GESTURE">
      <GesturePassword @complete="gestureComplete" :show-gesture="showGesture()"></GesturePassword>
    </div>
    <template #footer>
      <div style="display: flex;justify-content: space-between">
        <div>
          <el-link v-if="passwordStore.serviceStatus === ServiceStatus.NO_LOGIN" type="primary" @click="toLogin" :underline="false">返回登录页</el-link>
        </div>
        <el-button v-if="mainPasswordType === MainPasswordType.STANDARD" @click="alertConfirm(formRef)" type="primary">确定</el-button>
      </div>
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