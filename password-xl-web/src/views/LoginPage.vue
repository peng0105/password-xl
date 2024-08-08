<script setup lang="ts">
import {useLoginStore} from "@/stores/LoginStore.ts";
import {useRoute} from "vue-router";

const route = useRoute()
const loginStore = useLoginStore()

// 登录进度 1.选择登录方式 2.录入登录表单
const loginStep = ref(1)

// 选择了登录方式
const loginTypeChange = (type: string) => {
  console.log('登录，选择了登录方式：', type)
  loginStore.loginType = type;
  if (type === 'electron' || type === 'android') {
    return
  }

  loginStep.value = 2;
  // 向浏览历史中插入当前页，按返回按钮时回退到登录方式选择
  history.pushState(history.state, '', document.URL);
}

// 监听浏览器返回事件
window.addEventListener('popstate', function () {
  console.log('登录，监听浏览器返回事件')
  if (loginStep.value === 2) {
    console.log('登录，登录进度为2时返回1')
    // 登录进度为2时返回1
    loginStep.value = 1
  }
});

// 从url初始化登录form
const initForm = () => {
  let type = (route.query.type || '') + ''
  if (type) {
    loginTypeChange(type)
  }
}

initForm()
</script>

<template>

  <!-- 电脑版-->
  <div class="hidden-xs-only">
    <el-row>
      <el-col :sm="{span: 12, offset: 6}" :md="{span: 18, offset: 3}" :lg="{span: 14, offset: 5}"
              :xl="{span: 10, offset: 7}">
        <div class="login-card-pc">
          <el-row>
            <el-col class="hidden-sm-and-down" :span="12">
              <img alt="" src="~@/assets/images/login/login.png">
            </el-col>
            <el-col :sm="{span: 24}" :md="{span: 12}">
              <div style="position: sticky">
                <transition name="slide">
                  <div v-if="loginStep === 1" class="sliding-element">
                    <div class="login-title">
                      欢迎使用 password-XL
                    </div>
                    <TextLine class="select-type-tip" text="请选择登录方式"></TextLine>
                    <LoginType @loginTypeChange="loginTypeChange"></LoginType>
                  </div>
                  <div v-else class="sliding-element" v-loading="loginStore.logging" element-loading-text="正在登录...">
                    <div style="padding: 8px">
                      <el-link v-if="loginStep === 2" @click="loginStep = 1" type="primary" :underline="false">
                        <span class="iconfont icon-back login-back"></span>返回
                      </el-link>
                    </div>
                    <OSSLoginForm v-if="loginStore.loginType === 'oss'"></OSSLoginForm>
                    <COSLoginForm v-if="loginStore.loginType === 'cos'"></COSLoginForm>
                    <LocalLoginForm v-if="loginStore.loginType === 'local'"></LocalLoginForm>
                    <PrivateLoginForm v-if="loginStore.loginType === 'private'"></PrivateLoginForm>
                  </div>
                </transition>
              </div>
            </el-col>
          </el-row>
        </div>
      </el-col>
    </el-row>
  </div>

  <!-- 手机版-->
  <div class="hidden-sm-and-up">
    <div class="login-form-div">
      <el-row>
        <el-col style="text-align: center;">
        <el-text class="login-title" style="padding: 5px 15px">
          欢迎使用 password-XL
        </el-text>
        </el-col>
      </el-row>
      <div style="display: flex;justify-content: center;">
        <transition name="slide">
          <div class="login-form-card" v-if="loginStep === 1">
            <TextLine style="margin-top: 20px;margin-bottom: 0" text="请选择登录方式"></TextLine>
            <LoginType @loginTypeChange="loginTypeChange"></LoginType>
          </div>
          <div class="login-form-card" v-else v-loading="loginStore.logging" element-loading-text="正在登录...">
            <el-row style="margin-top: 20px">
              <el-col :span="22" :offset="1">
                <OSSLoginForm v-if="loginStore.loginType === 'oss'"></OSSLoginForm>
                <COSLoginForm v-if="loginStore.loginType === 'cos'"></COSLoginForm>
                <LocalLoginForm v-if="loginStore.loginType === 'local'"></LocalLoginForm>
                <PrivateLoginForm v-if="loginStore.loginType === 'private'"></PrivateLoginForm>
              </el-col>
            </el-row>
          </div>
        </transition>
      </div>
    </div>
  </div>

  <!-- ICP备案 -->
  <ICPRecord></ICPRecord>
</template>

<style scoped>
.login-card-pc {
  margin-top: 15vh;
  border-radius: 5px;
  overflow: hidden;
  height: 520px;
  box-shadow: rgba(0, 0, 0, 0.12) 0 0 12px 0;
  backdrop-filter: blur(50px);
}

.login-title {
  padding: 5px 15px;
  margin-top: 30px;
  text-align: center;
  font-size: 24px;
  width: auto;
  color: #444;
  backdrop-filter: blur(50px);
}

.login-card-pc img {
  width: 100%;
  height: 100%;
}

.sliding-element {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.login-back {
  margin-right: 5px;
  margin-left: 5px;
  position: relative;
  top: 1px;
}

.select-type-tip {
  margin-top: 30px;
}

.login-form-div {
  padding-top: 50px;
  padding-bottom: 50px;
  background: linear-gradient(to bottom, rgba(0, 196, 255, 0.18), #ffffff00 100%);
}

.login-form-card {
  border: 1px solid #eee;
  margin: 60px 15px;
  border-radius: 8px;
  padding-bottom: 10px;
  box-shadow: rgba(0, 0, 0, 0.12) 0 0 12px 0;
  backdrop-filter: blur(50px);
  position: absolute;
  width: 90%;
}

.slide-enter-active, .slide-leave-active {
  transition: all 0.25s ease-out;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.slide-enter-to {
  opacity: 1;
  transform: translateX(0);
}

.slide-leave-from {
  transform: translateX(0);
}

.slide-leave-to {
  display: none;
  transform: translateX(-100%);
}
</style>