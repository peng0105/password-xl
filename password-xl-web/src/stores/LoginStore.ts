import {defineStore} from "pinia";
import {browserFingerprint, checkPassword, decryptAES, encryptAES} from "@/utils/security.ts";
import {DatabaseForCOS} from "@/database/DatabaseForCOS.ts";
import {DatabaseForOSS} from "@/database/DatabaseForOSS.ts";
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
            console.log('开始自动登录')
            return new Promise(async (resolve) => {
                // 获取存储引擎对象
                let database: any = null
                if (loginForm.loginType === 'oss') {
                    database = new DatabaseForOSS()
                } else if (loginForm.loginType === 'cos') {
                    database = new DatabaseForCOS()
                } else if (loginForm.loginType === 'private') {
                    database = new DatabaseForPrivate()
                } else if (loginForm.loginType === 'electron') {
                    database = new DatabaseForElectron()
                }  else if (loginForm.loginType === 'android') {
                    database = new DatabaseForAndroid()
                } else {
                    console.error('未知的登录类型，无法自动登录：', loginForm.loginType)
                    resolve(false)
                    return
                }
                this.loginType = loginForm.loginType

                console.log('自动登录中...')
                let passwordStore = usePasswordStore();
                passwordStore.loading('自动登录中...')

                // 登录存储引擎
                let result = await database.login(loginForm)
                if (!result.status) {
                    console.log('自动登录失败 存储引擎登录失败', result)
                    passwordStore.unloading()
                    resolve(false)
                    return
                }

                // 初始化信息
                let resp = await passwordStore.passwordManager.login(database).catch(() => resolve(false))
                if (!resp || !resp.status) {
                    console.log('自动登录初始化失败', resp)
                    passwordStore.unloading()
                    resolve(false)
                    return
                }

                if (passwordStore.serviceStatus === ServiceStatus.LOGGED) {
                    // 已登录使用主密码自动解锁
                    let unlockResult = passwordStore.passwordManager.unlock(mainPassword);
                    console.log('自动登录 解锁结果：', unlockResult);
                    passwordStore.unloading()
                    resolve(unlockResult);
                } else if (passwordStore.serviceStatus === ServiceStatus.WAIT_INIT) {
                    // 待初始化主密码
                    passwordStore.unloading()
                    resolve(true);
                }
                this.loginForm = loginForm
            })
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
            return await useRefStore().verifyPasswordRef.getAndVerify((mainPassword: string) => checkPassword(mainPassword, loginInfo.loginForm),loginInfo.mainPasswordType);
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