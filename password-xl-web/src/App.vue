<script lang="ts" setup>
import {zhCn} from "element-plus/es/locale/index";
import {useRefStore} from "@/stores/RefStore.js";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {TopicMode} from "@/types";
import {useSettingStore} from "@/stores/SettingStore.ts";
import desktopBackground from '@/assets/images/background.svg'
import mobileBackground from '@/assets/images/background-m.svg'
import desktopStaticBackground from '@/assets/images/background-static.svg'
import mobileStaticBackground from '@/assets/images/background-m-static.svg'

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

const backgroundMode = computed(() => settingStore.setting.backgroundMode)
const backgroundImages = computed(() => backgroundMode.value === 'static'
  ? {desktop: desktopStaticBackground, mobile: mobileStaticBackground}
  : {desktop: desktopBackground, mobile: mobileBackground})

// 同步更新旧版开关，确保保存设置时携带一致的兼容值。
watch(backgroundMode, (mode) => {
  const enabled = mode !== 'off'
  settingStore.setting.dynamicBackground = enabled
  localStorage.setItem('backgroundMode', mode)
  localStorage.setItem('dynamicBackground', String(enabled))
}, {immediate: true, flush: 'sync'})

</script>
<template>
  <!-- 背景-->
  <picture v-if="backgroundMode !== 'off'" :key="backgroundMode" aria-hidden="true">
    <source media="(max-width: 767px)" :srcset="backgroundImages.mobile">
    <img alt="" class="back-img" :src="backgroundImages.desktop">
  </picture>

  <div id="password-app" v-loading="passwordStore.globalLoading.vis" :element-loading-text="passwordStore.globalLoading.content"
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
  pointer-events: none;
}

#password-app {
  height: 100vh;
}

</style>
