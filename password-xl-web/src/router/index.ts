import {createRouter, createWebHashHistory} from 'vue-router'

import routes from './routes'
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {ServiceStatus} from "@/types";
import {useLoginStore} from "@/stores/LoginStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";

const loginStatus = [ServiceStatus.LOGGED, ServiceStatus.WAIT_INIT, ServiceStatus.UNLOCKED]

// 路由参数配置
const router = createRouter({
    history: createWebHashHistory(),
    routes: routes,
})

// 全局前置守卫，用户登录判断
router.beforeEach((to, from, next) => {
    console.log('路由变化：', from.path, to.path)
    if (to.path === "/login" || to.path === "/test") {
        next()
        return
    }
    let passwordStore = usePasswordStore()
    const settingStore = useSettingStore()
    // 判断状态是否已登录
    if (loginStatus.includes(passwordStore.serviceStatus)) {
        next();
        return;
    }
    if (!settingStore.setting.autoLogin || to.path.startsWith('/login')) {
        next('/login')
        return
    }

    try {
        console.log('router 尝试自动登录')
        // 尝试自动登录
        useLoginStore().autoLogin().then((result: boolean) => {
            console.log('router 自动登录结果:', result)
            if (result) {
                next()
            } else {
                console.log('autoLoginFail')
                next('/login')
            }
        })
    } catch (err) {
        console.error('router 自动登录异常', err)
        next('/login');
    }
})

// 导出默认值
export default router
