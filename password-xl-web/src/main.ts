import {createApp} from 'vue'
import App from './App.vue'
import router from './router'
import {createPinia} from 'pinia'

import piniaReset from "./stores/piniaReset";

import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/display.css'
import '@/assets/iconfont/iconfont.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

const pinia = createPinia()
pinia.use(piniaReset);

let app = createApp(App);
app.use(router)
app.use(pinia)
app.mount('#app')
