import {defineStore} from "pinia";
import {browserFingerprint, checkPassword, decryptAES, encryptAES} from "@/utils/security.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {LoginInfo, LoginStore, ServiceStatus} from "@/types";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {DatabaseForPrivate} from "@/database/DatabaseForPrivate.ts";
import {DatabaseForElectron} from "@/database/DatabaseForElectron.ts";
import {DatabaseForAndroid} from "@/database/DatabaseForAndroid.ts";


export const useLoginStore = defineStore('loginStore', {
    state: (): LoginStore => {
        return {
            loginType: '',
            logging: false,
            loggingText: '正在登录...',
            loginForm: null
        }
    },
    actions: {
        startLogin: async function (loginForm: any, mainPassword: string): Promise<boolean> {
            const passwordStore = usePasswordStore()
            passwordStore.loading('自动登录中...')
            try {
                let database
                if (loginForm.loginType === 'oss') {
                    const {DatabaseForOSS} = await import('@/database/DatabaseForOSS.ts')
                    database = new DatabaseForOSS()
                } else if (loginForm.loginType === 'cos') {
                    const {DatabaseForCOS} = await import('@/database/DatabaseForCOS.ts')
                    database = new DatabaseForCOS()
                } else if (loginForm.loginType === 'private') {
                    database = new DatabaseForPrivate()
                } else if (loginForm.loginType === 'electron') {
                    database = new DatabaseForElectron()
                } else if (loginForm.loginType === 'android') {
                    database = new DatabaseForAndroid()
                } else {
                    return false
                }
                this.loginType = loginForm.loginType
                if (!(await database.login(loginForm)).status) return false
                if (!(await passwordStore.passwordManager.login(database)).status) return false
                this.loginForm = loginForm
                if (passwordStore.serviceStatus === ServiceStatus.LOGGED) {
                    return passwordStore.passwordManager.unlock(mainPassword)
                }
                return passwordStore.serviceStatus === ServiceStatus.WAIT_INIT
            } catch (error) {
                console.error('自动登录失败', error)
                return false
            } finally {
                passwordStore.unloading()
            }
        },
        // 自动登录入口
        autoLogin(): Promise<boolean> {
            return new Promise(async (resolve) => {
                try {
                    // 获取local中的登录信息
                    let localCiphertext = localStorage.getItem('loginInfo')
                    if (!localCiphertext) {
                        console.log('自动登录loginInfo不存在')
                        resolve(false)
                        return
                    }

                    // 解密登录信息
                    let loginInfoStr = decryptAES(browserFingerprint(), localCiphertext)
                    if (!loginInfoStr) {
                        console.log('自动登录loginInfo解密失败')
                        resolve(false)
                        return
                    }
                    let loginInfo: LoginInfo = JSON.parse(loginInfoStr)
                    let mainPassword = await this.getMainPassword(loginInfo)
                    console.log('使用主密码解密登录信息')
                    let loginForm = JSON.parse(decryptAES(mainPassword, loginInfo.loginForm))

                    // 开始自动登录
                    let result = await this.startLogin(loginForm, mainPassword)
                    console.log('本地缓存自动登录结果', result)
                    resolve(result)
                } catch (e) {
                    console.log(e)
                    resolve(false)
                }
            })
        },
        // 获取主密码
        async getMainPassword(loginInfo: LoginInfo) {
            // 获取自动解锁保存的主密码信息
            let mainPasswordCiphertext = localStorage.getItem('mainPassword')
            if (mainPasswordCiphertext) {
                console.log('自动登录获取主密码 使用自动解锁的主密码')
                let mainPassword = decryptAES(browserFingerprint(), mainPasswordCiphertext)
                if (checkPassword(mainPassword, loginInfo.loginForm)) {
                    return mainPassword
                }
            }
            console.log('自动登录获取主密码 提示用户输入主密码')
            return await useRefStore().verifyPasswordRef.getAndVerify((mainPassword: string) => checkPassword(mainPassword, loginInfo.loginForm), loginInfo.mainPasswordType);
        },
        // 自动登录+自动解锁
        setAutoLoginInfo(mainPassword: string) {
            const settingStore = useSettingStore()
            let ciphertext = sessionStorage.getItem('loginForm')

            // 自动登录
            if (settingStore.setting.autoLogin && ciphertext) {
                // 使用浏览器指纹解密登录信息
                let loginForm = decryptAES(browserFingerprint(), ciphertext)
                console.log('使用浏览器指纹解密登录信息loginForm')
                // 使用主密码加密登录信息
                let loginInfo: LoginInfo = {
                    mainPasswordType: usePasswordStore().mainPasswordType,
                    loginForm: encryptAES(mainPassword, loginForm),
                }
                console.log('使用主密码加密登录信息loginInfo')
                // 将登录信息保存在localStorage中
                localStorage.setItem('loginInfo', encryptAES(browserFingerprint(), JSON.stringify(loginInfo)))
                // 删除session中的登录信息
                // 此刻想法：session中的登录信息是用浏览器指纹加密的，安全性低于主密码加密
                sessionStorage.removeItem('loginForm')
            }

            // 自动解锁
            if (settingStore.setting.autoUnlock) {
                let fingerprint = browserFingerprint()
                localStorage.setItem('mainPassword', encryptAES(fingerprint, mainPassword))
            }
        },
        // 修改记住的密码
        updateRememberLoginInfo(oldMainPassword: string, newMainPassword: string): boolean {
            console.log('修改密码，处理自动登录信息')
            try {
                // 从Storage获取登录信息
                let ciphertext = localStorage.getItem('loginInfo');
                if (!ciphertext) {
                    console.log('修改记住的密码ciphertext不存在')
                    return false
                }
                // 获取浏览器指纹
                let fingerprint = browserFingerprint()
                // 解密登录信息
                console.log('解密登录西悉尼')
                let loginInfoStr = decryptAES(fingerprint, ciphertext)
                if (!loginInfoStr) {
                    console.log('修改记住的密码ciphertext解密失败')
                    return false
                }
                // 登录信息对象
                let loginInfo: LoginInfo = JSON.parse(loginInfoStr)
                // 修改主密码类型
                let type = usePasswordStore().mainPasswordType
                console.log('修改密码，设置主密码类型：', type)
                loginInfo.mainPasswordType = type
                // 加密登录表单
                loginInfo.loginForm = encryptAES(newMainPassword, decryptAES(oldMainPassword, loginInfo.loginForm))

                // 存储到Storage
                console.log('修改密码，存储登录信息')
                localStorage.setItem('loginInfo', encryptAES(fingerprint, JSON.stringify(loginInfo)));
                return true
            } catch (err) {
                console.error('修改密码处理自动登录信息异常', err)
                return false
            }
        }
    }
})
