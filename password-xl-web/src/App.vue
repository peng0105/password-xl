<script lang="ts" setup>

import { getCurrentInstance, nextTick, onMounted, resolveDirective } from "vue";
import { useRouter } from "vue-router";
import { useSettingStore } from "@/stores/SettingStore";
import { usePasswordStore } from "@/stores/PasswordStore";

/**
 * ========= DIAG PANEL =========
 * 在页面左上角输出诊断结果，不依赖 console/vConsole
 */
type Level = "PASS" | "FAIL" | "WARN" | "INFO";

function ensurePanel() {
  const id = "__diag_panel__";
  let el = document.getElementById(id) as HTMLPreElement | null;
  if (!el) {
    el = document.createElement("pre");
    el.id = id;
    el.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "right:0",
      "max-height:55vh",
      "overflow:auto",
      "z-index:2147483647",
      "background:#111",
      "color:#0f0",
      "margin:0",
      "padding:8px",
      "font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      "white-space:pre-wrap",
      "pointer-events:auto",
      "opacity:0.95",
    ].join(";");
    document.documentElement.appendChild(el);
  }
  return el;
}

const panel = ensurePanel();

function log(level: Level, name: string, detail?: any) {
  const line =
      `[${level}] ${name}` +
      (detail === undefined ? "" : ` -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  panel.textContent += line + "\n";

  // 也输出到 console，方便你在普通浏览器里看
  if (level === "FAIL") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

function safe<T>(name: string, fn: () => T): T | undefined {
  try {
    const r = fn();
    log("PASS", name, r);
    return r;
  } catch (e: any) {
    log("FAIL", name, String(e?.stack || e?.message || e));
    return undefined;
  }
}

function supports(name: string, ok: boolean, detail?: any) {
  log(ok ? "PASS" : "FAIL", name, detail);
}

function warnIf(name: string, condition: boolean, detail?: any) {
  log(condition ? "WARN" : "PASS", name, detail);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * ========= 全局错误捕获 =========
 * 远程访问环境经常吞 console，这里直接打到面板
 */
window.addEventListener("error", (ev: any) => {
  log("FAIL", "window.error", `${ev?.message || ""} ${(ev?.error && (ev.error.stack || ev.error.message)) || ""}`.trim());
});
window.addEventListener("unhandledrejection", (ev: any) => {
  log("FAIL", "unhandledrejection", String(ev?.reason?.stack || ev?.reason?.message || ev?.reason || ev));
});

/**
 * ========= 核心：验证 Web API 是否支持 =========
 */
async function runApiDiagnostics() {
  log("INFO", "=== PROBE START ===");
  safe("UA", () => navigator.userAgent);
  safe("URL", () => location.href);
  safe("Location parts", () => ({
    origin: location.origin,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  }));

  // --- Storage ---
  supports("localStorage exists", typeof window.localStorage !== "undefined");
  safe("localStorage read/write", () => {
    localStorage.setItem("__t", "1");
    const v = localStorage.getItem("__t");
    localStorage.removeItem("__t");
    return v;
  });

  supports("sessionStorage exists", typeof window.sessionStorage !== "undefined");
  safe("sessionStorage read/write", () => {
    sessionStorage.setItem("__t", "1");
    const v = sessionStorage.getItem("__t");
    sessionStorage.removeItem("__t");
    return v;
  });

  // --- Cookie ---
  safe("cookie set/get", () => {
    document.cookie = "probe_cookie=1; path=/";
    return document.cookie.includes("probe_cookie=1");
  });

  // --- Crypto / getRandomValues ---
  supports("crypto exists", !!window.crypto);
  supports("crypto.getRandomValues", !!(window.crypto && "getRandomValues" in crypto));

  // --- TextEncoder / TextDecoder ---
  supports("TextEncoder exists", typeof (window as any).TextEncoder === "function");
  supports("TextDecoder exists", typeof (window as any).TextDecoder === "function");

  // --- Streams / Fetch ---
  supports("fetch exists", typeof window.fetch === "function");
  supports("ReadableStream exists", typeof (window as any).ReadableStream === "function");

  // --- Promise / async support (简单探测) ---
  safe("Promise basic", () => typeof Promise !== "undefined");
  safe("async function supported", () => {
    // eslint-disable-next-line no-new-func
    const fn = new Function("return (async function(){return 1})()");
    return fn() instanceof Promise;
  });

  // --- matchMedia & prefers-color-scheme ---
  supports("matchMedia exists", typeof window.matchMedia === "function");
  const mql = safe("matchMedia('(prefers-color-scheme: dark)')", () => window.matchMedia("(prefers-color-scheme: dark)"));
  if (mql) {
    supports("mql.addEventListener", typeof (mql as any).addEventListener === "function", typeof (mql as any).addEventListener);
    supports("mql.removeEventListener", typeof (mql as any).removeEventListener === "function", typeof (mql as any).removeEventListener);
    supports("mql.addListener (legacy)", typeof (mql as any).addListener === "function", typeof (mql as any).addListener);
    supports("mql.removeListener (legacy)", typeof (mql as any).removeListener === "function", typeof (mql as any).removeListener);

    // 绑定一次再解绑，验证不会抛错
    safe("mql bind/unbind change listener", () => {
      const cb = () => {};
      if (typeof (mql as any).addEventListener === "function") (mql as any).addEventListener("change", cb);
      else if (typeof (mql as any).addListener === "function") (mql as any).addListener(cb);

      if (typeof (mql as any).removeEventListener === "function") (mql as any).removeEventListener("change", cb);
      else if (typeof (mql as any).removeListener === "function") (mql as any).removeListener(cb);
      return "ok";
    });
  }

  // --- IndexedDB ---
  supports("indexedDB exists", typeof (window as any).indexedDB !== "undefined");
  safe("indexedDB open (basic)", () => {
    const idb: IDBFactory | undefined = (window as any).indexedDB;
    if (!idb) return "no indexedDB";
    return new Promise<string>((resolve, reject) => {
      const req = idb.open("__diag_db__", 1);
      req.onupgradeneeded = () => {};
      req.onsuccess = () => {
        try {
          req.result.close();
        } catch {}
        resolve("ok");
      };
      req.onerror = () => reject(req.error);
    });
  });

  // --- requestAnimationFrame / performance ---
  supports("requestAnimationFrame exists", typeof window.requestAnimationFrame === "function");
  supports("performance.now exists", typeof performance !== "undefined" && typeof performance.now === "function");

  // --- IntersectionObserver / ResizeObserver (部分 WebView 会缺) ---
  supports("IntersectionObserver exists", typeof (window as any).IntersectionObserver === "function");
  supports("ResizeObserver exists", typeof (window as any).ResizeObserver === "function");

  log("INFO", "=== PROBE END ===");
}

/**
 * ========= 框架层验证（Vue/Router/Pinia/ElementPlus） =========
 */
async function runFrameworkDiagnostics() {
  log("INFO", "=== FRAMEWORK START ===");

  // Vue instance
  supports("getCurrentInstance exists", !!getCurrentInstance());

  // Router
  const router = safe("useRouter()", () => useRouter());
  if (router) {
    safe("router.currentRoute.fullPath", () => router.currentRoute.value.fullPath);
    safe("router.currentRoute.path", () => router.currentRoute.value.path);
    safe("router.currentRoute.hash", () => router.currentRoute.value.hash);
    safe("router.currentRoute.name", () => router.currentRoute.value.name);
  }

  // Pinia stores (你项目里就是这两个)
  const settingStore = safe("useSettingStore()", () => useSettingStore());
  const passwordStore = safe("usePasswordStore()", () => usePasswordStore());

  // settingStore 字段链路（验证旧代码会不会空指针）
  if (settingStore) {
    safe("settingStore.setting exists", () => (settingStore as any).setting);
    safe("OLD read: settingStore.setting.dynamicBackground", () => (settingStore as any).setting.dynamicBackground);
  }

  // passwordStore 字段链路（验证旧模板会不会空指针）
  if (passwordStore) {
    safe("passwordStore.globalLoading exists", () => (passwordStore as any).globalLoading);
    safe("OLD read: passwordStore.globalLoading.vis", () => (passwordStore as any).globalLoading.vis);
    safe("OLD read: passwordStore.globalLoading.content", () => (passwordStore as any).globalLoading.content);
    warnIf("passwordStore.resetTimeoutLock is function", typeof (passwordStore as any).resetTimeoutLock !== "function", typeof (passwordStore as any).resetTimeoutLock);
  }

  // Element Plus v-loading 指令：用官方 resolveDirective 验证（最准）
  safe("resolveDirective('loading')", () => !!resolveDirective("loading"));

  // 额外：从 appContext 看 directives（仅参考，不作为最终依据）
  const inst = getCurrentInstance();
  if (inst?.appContext) {
    const directives = (inst.appContext as any).directives || {};
    safe("appContext.directives keys", () => Object.keys(directives));
  } else {
    log("WARN", "appContext not available", "");
  }

  // nextTick 是否能到达（能到达说明 setup 没直接崩）
  await nextTick();
  log("PASS", "nextTick reached", "");

  // 5 秒后检查 #app 状态（白屏时常见 firstChild=#comment）
  await sleep(5000);
  safe("#app exists", () => !!document.getElementById("app"));
  safe("#app childNodes", () => String(document.getElementById("app")?.childNodes?.length ?? -1));
  safe("#app innerHTML.len", () => String((document.getElementById("app")?.innerHTML ?? "").length));
  safe("#app firstChild nodeType", () => String(document.getElementById("app")?.firstChild?.nodeType ?? "null"));
  safe("#app firstChild nodeName", () => String((document.getElementById("app")?.firstChild as any)?.nodeName ?? "null"));

  log("INFO", "=== FRAMEWORK END ===");
}

onMounted(async () => {
  // 先跑 API，再跑框架层（都输出到面板）
  await runApiDiagnostics();
  await runFrameworkDiagnostics();
});

import {zhCn} from "element-plus/es/locale/index";
import {useRefStore} from "@/stores/RefStore.js";
import {TopicMode} from "@/types";

const refStore = useRefStore()
const settingStore = useSettingStore()
const passwordStore = usePasswordStore()

// 系统加载初始化主题
let topicMode = localStorage.getItem("topicMode") || 'auto';
passwordStore.setTopicMode(topicMode as TopicMode);

// 监听系统主题变化
const mql = window.matchMedia("(prefers-color-scheme: dark)");

const onChange = () => {
  const topicMode = localStorage.getItem("topicMode") || 'auto';
  console.log('系统主题变动，设置主题为：', topicMode)
  passwordStore.setTopicMode(topicMode as TopicMode);
};

if (typeof mql.addEventListener === 'function') {
  mql.addEventListener('change', onChange);
} else if (typeof (mql as any).addListener === 'function') {
  (mql as any).addListener(onChange);
}

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
}

#password-app {
  height: 100vh;
}

</style>
