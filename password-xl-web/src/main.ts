import {createApp} from 'vue'
import App from './App.vue'
import router from './router'
import {createPinia} from 'pinia'
import piniaReset from "./stores/piniaReset";

import 'element-plus/theme-chalk/display.css'
import '@/assets/iconfont/iconfont.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import axios from "axios";
import config from "@/config.ts";

const pinia = createPinia()
pinia.use(piniaReset);

let app = createApp(App);
app.use(router)
app.use(pinia)
app.mount('#app')
;(window as any).__BUILD_MARK__ = "2026-01-12-main-ts-001";
console.log("[main.ts] BUILD_MARK", (window as any).__BUILD_MARK__);

axios.get(config.apiServer + '/getVersion', { withCredentials: true }).then((res) => {
    console.log('v' + res.data.data)
}).catch((err) => {
    console.error('获取版本失败', err)
})