<script lang="ts" setup>
import {zhCn} from "element-plus/es/locale/index";
import {useRefStore} from "@/stores/RefStore.js";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {TopicMode} from "@/types";
import {useSettingStore} from "@/stores/SettingStore.ts";

const refStore = useRefStore()
const settingStore = useSettingStore()
const passwordStore = usePasswordStore()

// 系统加载初始化主题
let topicMode = localStorage.getItem("topicMode") || 'auto';
passwordStore.setTopicMode(topicMode as TopicMode);

// 监听系统主题变化
let isDarkTheme = window.matchMedia("(prefers-color-scheme: dark)")
isDarkTheme.addEventListener('change', () => {
  let topicMode = localStorage.getItem("topicMode") || 'auto';
  console.log('系统主题变动，设置主题为：', topicMode)
  passwordStore.setTopicMode(topicMode as TopicMode);
})

// 是否显示动态背景
const dynamicBackground = ref(false)

// 设置动态背景
const setDynamicBackground = () => {
  let config = localStorage.getItem('dynamicBackground')
  if (!config || 'true' === config) {
    dynamicBackground.value = true
  }
}
setDynamicBackground()

// 监听动态背景图设置变更
watch(() => settingStore.setting.dynamicBackground, (newValue: boolean) => {
  localStorage.setItem('dynamicBackground', newValue.toString())
  dynamicBackground.value = settingStore.setting.dynamicBackground
})

</script>
<template>
  <!-- 背景-->
  <img v-if="dynamicBackground" alt="" class="back-img hidden-xs-only" src="~@/assets/images/background.svg">
  <img v-if="dynamicBackground" alt="" class="back-img hidden-sm-and-up" src="~@/assets/images/background-m.svg">

  <div id="app" v-loading="passwordStore.globalLoading.vis" :element-loading-text="passwordStore.globalLoading.content"
       @click="passwordStore.resetTimeoutLock()">
    <el-config-provider :locale="zhCn">
      <router-view></router-view>

      <!-- 密码验证组件 -->
      <VerifyMainPassword :ref="(el:any) => refStore.verifyPasswordRef = el"></VerifyMainPassword>

      <!-- 快速登录组件 -->
      <FastLogin :ref="(el: any) => refStore.fastLoginRef = el"></FastLogin>

      <!-- Ai创建密码组件 -->
      <AiAddPassword :ref="(el: any) => refStore.aiAddPasswordRef = el"></AiAddPassword>
    </el-config-provider>
  </div>
</template>

<style>
body, html {
  padding: 0;
  margin: 0;
}

.back-img {
  width: 100vw;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  z-index: -2;
}

#app {
  height: 100vh;
}

</style>
