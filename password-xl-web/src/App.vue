<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { zhCn } from "element-plus/es/locale/index";
import { useRefStore } from "@/stores/RefStore.js";
import { usePasswordStore } from "@/stores/PasswordStore.ts";
import { TopicMode } from "@/types";
import { useSettingStore } from "@/stores/SettingStore.ts";

const refStore = useRefStore();
const settingStore = useSettingStore();
const passwordStore = usePasswordStore();

/** 安全读写 localStorage：避免某些环境（WebView/隐私模式/沙箱）抛异常导致 App 直接空渲染 */
function safeGetLS(key: string): string | null {
  return localStorage.getItem(key);
}
function safeSetLS(key: string, val: string) {
  localStorage.setItem(key, val);
}

/** 主题初始化 */
function applyTopicModeFromLS() {
  const topicMode = (safeGetLS("topicMode") || "auto") as TopicMode;
  try {
    passwordStore.setTopicMode(topicMode);
  } catch (e) {
    console.warn("[topicMode] setTopicMode failed:", e);
  }
}
applyTopicModeFromLS();

/** 监听系统主题变化（兼容 addEventListener / addListener） */
const mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

const onThemeChange = () => {
  const topicMode = (safeGetLS("topicMode") || "auto") as TopicMode;
  console.log("系统主题变动，设置主题为：", topicMode);
  try {
    passwordStore.setTopicMode(topicMode);
  } catch (e) {
    console.warn("[topicMode] setTopicMode failed:", e);
  }
};

onMounted(() => {
  if (!mql) return;
  try {
    if (typeof (mql as any).addEventListener === "function") {
      (mql as any).addEventListener("change", onThemeChange);
    } else if (typeof (mql as any).addListener === "function") {
      (mql as any).addListener(onThemeChange);
    }
  } catch (e) {
    console.warn("[mql] bind change listener failed:", e);
  }
});

onBeforeUnmount(() => {
  if (!mql) return;
  try {
    if (typeof (mql as any).removeEventListener === "function") {
      (mql as any).removeEventListener("change", onThemeChange);
    } else if (typeof (mql as any).removeListener === "function") {
      (mql as any).removeListener(onThemeChange);
    }
  } catch (e) {
    // ignore
  }
});

/** 动态背景：以 Store 为主，但对 store 未初始化/字段缺失做兜底 */
const dynamicBackground = ref(false);

/** store.setting 可能会在某些启动顺序下短暂为 undefined，做安全 computed */
const storeDynamicBackground = computed<boolean | undefined>(() => {
  try {
    return (settingStore as any)?.setting?.dynamicBackground;
  } catch {
    return undefined;
  }
});

function syncDynamicBackgroundFromLSOrStore() {
  // store 有值优先用 store；否则用 localStorage；再否则默认 true
  const fromStore = storeDynamicBackground.value;
  if (typeof fromStore === "boolean") {
    dynamicBackground.value = fromStore;
    return;
  }

  const config = safeGetLS("dynamicBackground");
  dynamicBackground.value = !config || config === "true";
}

syncDynamicBackgroundFromLSOrStore();

/** 监听 Store 变化（immediate + 容错） */
watch(
    storeDynamicBackground,
    (newValue) => {
      if (typeof newValue === "boolean") {
        safeSetLS("dynamicBackground", String(newValue));
        dynamicBackground.value = newValue;
      } else {
        // store 还没准备好/字段不存在时，回退到 LS
        syncDynamicBackgroundFromLSOrStore();
      }
    },
    { immediate: true }
);

/** Loading 容错：globalLoading 可能短暂为空，避免模板直接炸掉导致全局空渲染 */
const loadingVisible = computed<boolean>(() => {
  try {
    return !!(passwordStore as any)?.globalLoading?.vis;
  } catch {
    return false;
  }
});
const loadingText = computed<string>(() => {
  try {
    return String((passwordStore as any)?.globalLoading?.content ?? "");
  } catch {
    return "";
  }
});

function safeResetTimeoutLock() {
  try {
    (passwordStore as any)?.resetTimeoutLock?.();
  } catch (e) {
    console.warn("[resetTimeoutLock] failed:", e);
  }
}
</script>

<template>
  <!-- 背景 -->
  <img
      v-if="dynamicBackground"
      alt=""
      class="back-img hidden-xs-only"
      src="~@/assets/images/background.svg"
  />
  <img
      v-if="dynamicBackground"
      alt=""
      class="back-img hidden-sm-and-up"
      src="~@/assets/images/background-m.svg"
  />

  <div
      id="password-app"
      v-loading="loadingVisible"
      :element-loading-text="loadingText"
      @click="safeResetTimeoutLock"
  >
    <el-config-provider :locale="zhCn">
      <router-view />

      <!-- 密码验证组件 -->
      <VerifyMainPassword :ref="(el:any) => refStore.verifyPasswordRef = el" />

      <!-- 快速登录组件 -->
      <FastLogin :ref="(el: any) => refStore.fastLoginRef = el" />

      <!-- Ai创建密码组件 -->
      <AiAddPassword :ref="(el: any) => refStore.aiAddPasswordRef = el" />
    </el-config-provider>
  </div>
</template>

<style>
body,
html {
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

#password-app {
  height: 100vh;
}
</style>
