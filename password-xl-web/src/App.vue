<script lang="ts" setup>

import { getCurrentInstance, nextTick } from "vue";
import { useRouter } from "vue-router";

// ====== STARTUP DIAGNOSTICS (paste at top of App.vue setup) ======
type DiagLevel = "PASS" | "FAIL" | "WARN";

function ensureDiagPanel() {
  let el = document.getElementById("__diag__") as HTMLPreElement | null;
  if (!el) {
    el = document.createElement("pre");
    el.id = "__diag__";
    el.style.cssText =
        "position:fixed;z-index:2147483647;left:0;top:0;right:0;max-height:50vh;overflow:auto;" +
        "background:#111;color:#0f0;padding:10px;margin:0;font:12px/1.4 monospace;white-space:pre-wrap;";
    document.documentElement.appendChild(el);
  }
  return el;
}

const __diagEl = ensureDiagPanel();
function diag(level: DiagLevel, name: string, detail?: any) {
  const msg =
      `[${level}] ${name}` +
      (detail === undefined ? "" : ` -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  // 输出到页面 & 控制台（vConsole 会接管）
  __diagEl.textContent += msg + "\n";
  if (level === "FAIL") console.error(msg);
  else if (level === "WARN") console.warn(msg);
  else console.log(msg);
}

function safe(fn: () => any, name: string) {
  try {
    const r = fn();
    diag("PASS", name, r);
    return r;
  } catch (e: any) {
    diag("FAIL", name, String(e?.stack || e?.message || e));
    return undefined;
  }
}

function existsPath(obj: any, path: string) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return { ok: false, at: p, value: cur };
    cur = cur[p];
  }
  return { ok: true, value: cur };
}

/**
 * 验证所有“可能导致 App.vue 直接白屏空渲染”的点
 * - store 字段是否未就绪（setting/globalLoading）
 * - watch getter 是否会触发空指针
 * - element-plus v-loading 指令是否存在（没装也会炸）
 * - router 是否真的可用/当前路由是否到 login
 * - localStorage/sessionStorage 是否可用
 * - matchMedia 监听接口是否存在
 * - resetTimeoutLock 方法是否存在
 * - Vue errorHandler 是否吞错（给出建议）
 */
async function runStartupDiagnostics(stores: {
  settingStore?: any;
  passwordStore?: any;
}) {
  diag("PASS", "=== DIAG START ===");
  safe(() => navigator.userAgent, "UA");
  safe(() => location.href, "URL");
  safe(() => ({ origin: location.origin, pathname: location.pathname, hash: location.hash }), "Location parts");

  // 1) Storage 能力（你之前探针 OK，但这里再验证）
  safe(() => { localStorage.setItem("__t", "1"); const v = localStorage.getItem("__t"); localStorage.removeItem("__t"); return v; }, "localStorage read/write");
  safe(() => { sessionStorage.setItem("__t", "1"); const v = sessionStorage.getItem("__t"); sessionStorage.removeItem("__t"); return v; }, "sessionStorage read/write");

  // 2) matchMedia & 监听接口（常见 WebView 差异）
  safe(() => !!window.matchMedia, "matchMedia exists");
  const mql = safe(() => window.matchMedia?.("(prefers-color-scheme: dark)"), "matchMedia('(prefers-color-scheme: dark)') returns");
  if (mql) {
    diag(typeof (mql as any).addEventListener === "function" ? "PASS" : "WARN", "mql.addEventListener is function", typeof (mql as any).addEventListener);
    diag(typeof (mql as any).addListener === "function" ? "PASS" : "WARN", "mql.addListener is function", typeof (mql as any).addListener);
  }

  // 3) Vue 实例是否存在（判断是否已经进入 setup）
  safe(() => !!getCurrentInstance(), "getCurrentInstance exists");

  // 4) Element Plus v-loading 指令是否装好了（没装/指令名不对会导致模板渲染异常）
  const inst = getCurrentInstance();
  if (inst?.appContext) {
    const directives = (inst.appContext as any).directives || {};
    diag(directives?.loading ? "PASS" : "FAIL", "ElementPlus v-loading directive registered", Object.keys(directives || {}));
  } else {
    diag("WARN", "Cannot inspect appContext directives", "instance/appContext missing");
  }

  // 5) Router 是否存在、当前路由信息（hash路由应该能看到 #/login）
  const router = safe(() => useRouter(), "useRouter() available");
  if (router) {
    safe(() => router.currentRoute.value.fullPath, "router.currentRoute.fullPath");
    safe(() => router.currentRoute.value.path, "router.currentRoute.path");
    safe(() => router.currentRoute.value.hash, "router.currentRoute.hash");
    safe(() => router.currentRoute.value.name, "router.currentRoute.name");
  }

  // 6) 检查 stores 是否“字段未就绪” —— 这是你最核心的怀疑点
  const { settingStore, passwordStore } = stores;

  if (!settingStore) diag("WARN", "settingStore missing (not passed)", "");
  else {
    diag("PASS", "settingStore exists", "");
    const r1 = existsPath(settingStore, "setting");
    diag(r1.ok ? "PASS" : "FAIL", "settingStore.setting exists", r1);
    const r2 = existsPath(settingStore, "setting.dynamicBackground");
    diag(r2.ok ? "PASS" : "FAIL", "settingStore.setting.dynamicBackground exists", r2);

    // ✅ 验证“你旧写法 watch getter 是否会炸”
    safe(() => (settingStore.setting as any).dynamicBackground, "OLD getter: settingStore.setting.dynamicBackground");
  }

  if (!passwordStore) diag("WARN", "passwordStore missing (not passed)", "");
  else {
    diag("PASS", "passwordStore exists", "");
    const r3 = existsPath(passwordStore, "globalLoading");
    diag(r3.ok ? "PASS" : "FAIL", "passwordStore.globalLoading exists", r3);
    const r4 = existsPath(passwordStore, "globalLoading.vis");
    diag(r4.ok ? "PASS" : "FAIL", "passwordStore.globalLoading.vis exists", r4);
    const r5 = existsPath(passwordStore, "globalLoading.content");
    diag(r5.ok ? "PASS" : "FAIL", "passwordStore.globalLoading.content exists", r5);

    // ✅ 验证“你旧模板访问是否会炸”
    safe(() => (passwordStore.globalLoading as any).vis, "OLD read: passwordStore.globalLoading.vis");
    safe(() => (passwordStore.globalLoading as any).content, "OLD read: passwordStore.globalLoading.content");

    // 事件回调存在性
    diag(typeof passwordStore.resetTimeoutLock === "function" ? "PASS" : "WARN", "passwordStore.resetTimeoutLock is function", typeof passwordStore.resetTimeoutLock);
  }

  // 7) DOM 检查：5s 后 #app 是否还是注释节点（你之前看到的核心现象）
  setTimeout(() => {
    const app = document.getElementById("app");
    if (!app) return diag("FAIL", "#app element exists", "missing");
    diag("PASS", "#app.childNodes", String(app.childNodes.length));
    diag("PASS", "#app.innerHTML.len", String((app.innerHTML || "").length));
    diag("PASS", "#app.firstChild.nodeType", app.firstChild ? String(app.firstChild.nodeType) : "null");
    diag("PASS", "#app.firstChild.nodeName", app.firstChild ? String((app.firstChild as any).nodeName) : "null");
    diag("PASS", "=== DIAG END ===");
  }, 5000);

  // 8) 额外：下一个 tick 看看是否已经渲染出元素（如果有瞬态变化能抓到）
  await nextTick();
  diag("PASS", "nextTick reached", "");
}
// ====== ENDUP DIAGNOSTICS ======


import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { zhCn } from "element-plus/es/locale/index";
import { useRefStore } from "@/stores/RefStore.js";
import { usePasswordStore } from "@/stores/PasswordStore.ts";
import { TopicMode } from "@/types";
import { useSettingStore } from "@/stores/SettingStore.ts";

const refStore = useRefStore();
const settingStore = useSettingStore();
const passwordStore = usePasswordStore();

runStartupDiagnostics({ settingStore, passwordStore });

/** 安全读写 localStorage：避免某些环境（WebView/隐私模式/沙箱）抛异常导致 App 直接空渲染 */
function safeGetLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn("[LS:get] failed:", key, e);
    return null;
  }
}
function safeSetLS(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch (e) {
    console.warn("[LS:set] failed:", key, e);
  }
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
