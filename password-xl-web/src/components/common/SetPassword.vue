<!--设置主密码组件（初始化/修改密码）-->
<script lang="ts" setup>
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {MainPasswordType, RespData, ServiceStatus} from "@/types";
import {useLoginStore} from "@/stores/LoginStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {displaySize} from "@/utils/global.ts";

const passwordStore = usePasswordStore()
const loginStore = useLoginStore()
const refStore = useRefStore()

// 表单Ref
const setPasswordFormRef = ref()
// 第一次输入的主密码
const firstPasswordInputRef = ref()
// 第二次输入的主密码
const secondMainPasswordRef = ref()

// 初始化主密码组件是否显示
const setPasswordVis = ref(false)
// 主密码类型
const mainPasswordType: Ref<MainPasswordType> = ref(JSON.parse(JSON.stringify(passwordStore.mainPasswordType)))
// 修改密码时的旧密码
const updateOldMainPassword = ref('')
// 绘制的手势密码
const gesturePassword = ref('')

// 密码表单
const setPasswordForm = reactive({
  firstMainPassword: '',
  secondMainPassword: '',
})

// 密码表单校验规则
const setPasswordFormRules = reactive({
  firstMainPassword: [
    {required: true, message: '请输入主密码', trigger: 'blur'}
  ],
  secondMainPassword: [
    {required: true, message: '请再次输入主密码', trigger: 'blur'}
  ]
})

// 设置密码（组件入口）
const setMainPassword = () => {
  console.log('进入设置密码')
  setPasswordForm.firstMainPassword = ''
  setPasswordForm.secondMainPassword = ''
  gesturePassword.value = ''

  if (passwordStore.serviceStatus === ServiceStatus.WAIT_INIT) {
    console.log('设置密码，初始化主密码')
    // 初始化主密码
    setPasswordVis.value = true;
  } else {
    console.log('设置密码，先验证当前密码是否正确')
    // 修改密码，先验证当前密码是否正确
    refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then((mainPassword: string) => {
      updateOldMainPassword.value = mainPassword
      setPasswordVis.value = true;
      console.log('设置密码，验证当前密码是否正确 通过')
    })
  }
}

// 标准主密码-确认事件
const setMainPasswordConfirm = (setPasswordFormRef: any) => {
  console.log('设置密码，标准主密码 确认')
  // 校验密码表单
  setPasswordFormRef.validate((valid: any) => {
    if (!valid) return
    if (setPasswordForm.firstMainPassword !== setPasswordForm.secondMainPassword) {
      console.log('设置密码，标准主密码 两次输入的密码不一致')
      ElMessage.error('两次输入的密码不一致')
      return;
    }
    if (setPasswordForm.firstMainPassword === updateOldMainPassword.value) {
      console.log('设置密码，标准主密码 新密码与原密码一致')
      ElMessage.error('新密码与原密码一致')
      return;
    }

    if (passwordStore.serviceStatus === ServiceStatus.WAIT_INIT) {
      // 初始化主密码
      initMainPassword(setPasswordForm.firstMainPassword)
    } else {
      // 修改主密码
      updateMainPassword(setPasswordForm.firstMainPassword)
    }
  })
}

// 手势主密码-绘制完成事件
const drawGesture = (mainPassword: string) => {
  console.log('设置密码，手势主密码 绘制完成事件')
  if (!gesturePassword.value) {
    console.log('设置密码，手势主密码 第一次绘制')
    // 第一次绘制
    gesturePassword.value = mainPassword
    return
  }
  if (mainPassword.length < 5) {
    return;
  }
  if (gesturePassword.value !== mainPassword) {
    gesturePassword.value = ''
    ElMessage.warning('两次绘制的密码不一致')
    return;
  }
  if (gesturePassword.value === updateOldMainPassword.value) {
    gesturePassword.value = ''
    console.log('设置密码，手势主密码 新密码与原密码一致')
    ElMessage.error('新密码与原密码一致')
    return;
  }
  if (passwordStore.serviceStatus === ServiceStatus.WAIT_INIT) {
    // 初始化主密码
    initMainPassword(gesturePassword.value)
  } else {
    // 修改主密码
    updateMainPassword(gesturePassword.value)
  }
}

// 密码输入完成/手势绘制完成-初始化主密码
const initMainPassword = (newPassword: string) => {
  console.log('设置密码，输入完成 初始化主密码')
  passwordStore.loading()
  passwordStore.passwordManager.initMainPassword(mainPasswordType.value, newPassword).then((resp: RespData) => {
    if (resp.status) {
      setPasswordVis.value = false
      console.log('设置密码，设置成功')
      ElMessage.success('设置成功')
      // 记住密码
      loginStore.setAutoLoginInfo(newPassword)
    } else {
      console.log('设置密码，设置失败 ', resp.message)
      ElMessage.error(resp.message)
    }
    passwordStore.unloading()
  }).catch(() => {
    passwordStore.unloading()
  })
}

// 密码输入完成/手势绘制完成-修改主密码
const updateMainPassword = (newPassword: string) => {
  console.log('设置密码，输入完成 修改主密码')
  passwordStore.passwordManager.updateMainPassword(updateOldMainPassword.value, mainPasswordType.value, newPassword).then((resp: RespData) => {
    if (resp.status) {
      setPasswordVis.value = false
      // 记住密码
      loginStore.setAutoLoginInfo(newPassword)
      console.log('设置密码，修改成功')
      ElMessage.success('修改成功')
    } else {
      console.log('设置密码，修改失败：', resp.message)
      ElMessage.error(resp.message)
    }
    passwordStore.unloading()
  }).catch(() => {
    passwordStore.unloading()
  })
}

// 监听密码类型，清空校验状态
watch(mainPasswordType, () => {
  setPasswordFormRef.value?.clearValidate();
})

defineExpose({
  setMainPassword
})
</script>

<template>
  <!-- 初始化主密码 -->
  <el-dialog
      v-model="setPasswordVis"
      :close-on-click-modal="false"
      :close-on-press-escape="passwordStore.serviceStatus !== ServiceStatus.WAIT_INIT"
      :show-close="passwordStore.serviceStatus !== ServiceStatus.WAIT_INIT"
      :width="['xs'].includes(displaySize().value)?'95%':'550px'"
      @open="setPasswordFormRef?.resetFields()"
      @opened="firstPasswordInputRef?.focus()"
  >
    <template #header>
      <el-text size="large" style="user-select: none;">
        <span class="iconfont icon-verify"></span>
        设置主密码
      </el-text>
    </template>
    <el-alert :closable="false" show-icon style="margin-top: 10px" title="主密码一旦遗忘，所有密码均无法找回！请慎重设置您的主密码。"
              type="warning"></el-alert>

    <el-tabs v-model="mainPasswordType" style="margin-top: 15px" type="card">
      <el-tab-pane :name="MainPasswordType.STANDARD" label="标准密码">
        <el-form
            ref="setPasswordFormRef"
            :model="setPasswordForm"
            :rules="setPasswordFormRules"
            label-width="80px"
            style="width: 300px;margin: 20px auto;"
            @submit.native.prevent>
          <el-form-item label="主密码" prop="firstMainPassword">
            <el-input
                ref="firstPasswordInputRef"
                v-model="setPasswordForm.firstMainPassword"
                autocomplete="new-password"
                placeholder="请输入主密码"
                show-password
                type="password"
                @keyup.enter.native="secondMainPasswordRef.focus()"
            ></el-input>
          </el-form-item>
          <el-form-item label="确认密码" prop="secondMainPassword" style="padding-top: 10px">
            <el-input
                ref="secondMainPasswordRef"
                v-model="setPasswordForm.secondMainPassword"
                autocomplete="new-password"
                placeholder="请再次输入主密码"
                show-password
                type="password"
                @keyup.enter.native="setMainPasswordConfirm(setPasswordFormRef)"
            ></el-input>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane :disabled="passwordStore.globalLoading.vis" :name="MainPasswordType.GESTURE" label="手势密码">
        <div v-if="mainPasswordType === MainPasswordType.GESTURE" style="margin-top: 10px;text-align: center">
          <el-text v-if="!gesturePassword">请绘制手势密码</el-text>
          <el-text v-else>请再次绘制手势密码</el-text>
          <GesturePassword style="width: 350px;margin: 0 auto;" @complete="drawGesture"></GesturePassword>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template v-if="mainPasswordType === MainPasswordType.STANDARD" #footer>
      <el-button :disabled="passwordStore.globalLoading.vis" type="primary"
                 @click="setMainPasswordConfirm(setPasswordFormRef)">确定
      </el-button>
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