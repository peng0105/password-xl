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
import {preloadPinyinMatcher} from "@/utils/pinyin.ts";

const pinia = createPinia()
pinia.use(piniaReset);

let app = createApp(App);
app.use(router)
app.use(pinia)
app.mount('#app')

preloadPinyinMatcher()

setTimeout(() => {
    axios.get(config.apiServer + '/getVersion', {withCredentials: true}).then((res) => {
        console.log('最新版本为：v' + res.data.data)
    }).catch((err) => {
        console.error('获取版本失败', err)
    })
}, 2000)
