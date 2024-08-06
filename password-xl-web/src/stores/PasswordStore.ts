import {defineStore} from 'pinia'
import {MainPasswordType, Password, PasswordStatus, PasswordStore, ServiceStatus, Sort, TopicMode} from "@/types";
import {useDark} from '@vueuse/core'
import {getLocationUrl, getPasswordStrength, searchStr} from "@/utils/global.ts";
import {PasswordManagerImpl} from "@/service/PasswordManager.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useLoginStore} from "@/stores/LoginStore.ts";

export const usePasswordStore = defineStore('passwordStore', {
    state: (): PasswordStore => {
        return {
            // 密码管理器
            passwordManager: new PasswordManagerImpl(),
            // 全部密码列表
            allPasswordArray: [],
            // 标签树
            labelArray: [],
            // 主密码
            mainPassword: '',
            // 服务状态
            serviceStatus: ServiceStatus.NO_LOGIN,
            // 主题
            topicMode: TopicMode.AUTO,
            // 主密码类型
            mainPasswordType: MainPasswordType.GESTURE,
            // 超时锁
            timeoutLock: null,
            // 加载中动画
            globalLoading: {
                vis: false,
                timeout: null,
                content: ''
            },
            // 密码列表筛选条件
            filterCondition: {
                // 文字搜索
                searchText: '',
                // 标签搜索
                labelArray: [],
                // 收藏搜索
                favoriteId: 0
            }
        }
    },
    getters: {
        // 排序后的密码列表
        passwordArray(): Array<Password> {
            console.log('获取排序后的密码列表')
            const settingStore = useSettingStore()
            // 过滤出状态为 NORMAL 的密码
            let array = this.allPasswordArray
                .filter(password => password.status === PasswordStatus.NORMAL)
                .sort((a: Password, b: Password) => {
                    // 获取比较值
                    let aSort = a[settingStore.setting.sortField];
                    let bSort = b[settingStore.setting.sortField];

                    // 如果排序字段是 strength，则使用密码强度进行比较
                    if ((settingStore.setting.sortField as string) === 'strength') {
                        aSort = getPasswordStrength(a.password);
                        bSort = getPasswordStrength(b.password);
                    }
                    // 比较值并返回排序结果
                    if (aSort > bSort) {
                        return settingStore.setting.sortOrder === Sort.ASC ? 1 : -1;
                    } else if (aSort < bSort) {
                        return settingStore.setting.sortOrder === Sort.ASC ? -1 : 1;
                    } else {
                        return 0;
                    }
                });

            console.log('排序后的密码列表数量：', array.length)
            return array
        },
        // 已删除的密码列表
        deletedArray(): Array<Password> {
            console.log('获取已删除的密码列表')
            let array = this.allPasswordArray.filter(password => password.status === PasswordStatus.DELETED).sort((a: Password, b: Password) => {
                if (a.deleteTime > b.deleteTime) {
                    return 1
                } else if (a.deleteTime < b.deleteTime) {
                    return -1
                } else {
                    return 0;
                }
            })
            console.log('已删除的密码列表数量：', array.length)
            return array
        },
        // 收藏的密码列表
        favoritePasswordArray(): Array<Password>{
            console.log('获取收藏的密码列表')
            let array = this.passwordArray.filter(p => p.favorite)
                .sort((a: Password, b: Password) => {
                    if (a.favoriteTime > b.favoriteTime) {
                        return 1
                    } else if (a.favoriteTime < b.favoriteTime) {
                        return -1
                    } else {
                        return 0;
                    }
                })
            console.log('收藏的密码列表数量：', array.length)
            return array
        },
        // 显示的密码列表
        visPasswordArray(): Array<Password> {
            console.log('获取显示的密码列表')
            let array = this.passwordArray.filter(password => {

                // 收藏选定结果
                if (this.filterCondition.favoriteId) {
                    return password.id === this.filterCondition.favoriteId
                }

                // 文本搜索结果
                let textSearchResult = true
                // 标签搜索结果
                let labelSearchResult = true

                // 文本搜索
                if (this.filterCondition.searchText) {
                    textSearchResult = false
                    const searchFields = [
                        password.title,
                        password.address,
                        password.username,
                        password.password,
                        password.remark,
                        ...Object.entries(password.customFields).flat()
                    ].filter(Boolean);
                    for (const field of searchFields) {
                        if (searchStr(this.filterCondition.searchText.trim(), field)) {
                            textSearchResult = true
                            break
                        }
                    }
                }

                // 标签搜索
                if (this.filterCondition.labelArray.length) {
                    labelSearchResult = false
                    const passwordLabels = new Set(password.labels);
                    for (const label of this.filterCondition.labelArray) {
                        if (passwordLabels.has(label)) {
                            labelSearchResult = true
                            break
                        }
                    }
                }
                return textSearchResult && labelSearchResult;
            });

            console.log('显示的密码列表数量：', array.length)
            return array
        },
        // 深色模式
        isDark(): boolean {
            return this.topicMode === TopicMode.DARK
        }
    },
    actions: {
        // 设置服务状态
        setServiceStatus(serviceStatus: ServiceStatus) {
            console.log('服务状态变更为：', serviceStatus)
            this.serviceStatus = serviceStatus
        },
        // 退出登录
        logout() {
            console.log('退出登录')
            sessionStorage.removeItem('loginForm')
            localStorage.removeItem('loginInfo')
            localStorage.removeItem('mainPassword')
            localStorage.removeItem('topicMode')

            this.passwordManager = new PasswordManagerImpl()
            this.allPasswordArray = []
            this.labelArray = []
            this.mainPassword = ''
            this.serviceStatus = ServiceStatus.NO_LOGIN

            usePasswordStore().$resetFields()
            useLoginStore().$resetFields()
            useSettingStore().$resetFields()

            location.href = getLocationUrl() + '#/login';
        },
        // 设置主题
        setTopicMode(topic: TopicMode) {
            console.log('设置主题:', topic)
            localStorage.setItem('topicMode', topic)
            if (topic === TopicMode.AUTO) {
                let isDarkTheme = window.matchMedia("(prefers-color-scheme: dark)")
                useDark().value = isDarkTheme.matches
                this.topicMode = isDarkTheme.matches ? TopicMode.DARK : TopicMode.LIGHT
                if (window.env && window.env.electron) {
                    window.electronAPI.setTopic('system');
                }
            } else if (topic === TopicMode.DARK) {
                useDark().value = true
                this.topicMode = TopicMode.DARK
                if (window.env && window.env.electron) {
                    window.electronAPI.setTopic(this.topicMode);
                }
            } else if (topic === TopicMode.LIGHT) {
                useDark().value = false
                this.topicMode = TopicMode.LIGHT
                if (window.env && window.env.electron) {
                    window.electronAPI.setTopic(this.topicMode);
                }
            }
        },
        // 全局加载
        loading(content?: string) {
            console.log('触发全局加载')
            this.globalLoading.timeout = setTimeout(() => {
                this.globalLoading.timeout = null
                this.globalLoading.vis = true
                this.globalLoading.content = (content || '请稍等')
            }, 300)
        },
        // 取消全局加载
        unloading() {
            console.log('取消全局加载')
            if (this.globalLoading.timeout) {
                clearTimeout(this.globalLoading.timeout)
                this.globalLoading.timeout = null
            }
            this.globalLoading.vis = false;
        },
        // 重置超时自动锁定时长
        resetTimeoutLock() {
            if (this.timeoutLock) {
                clearTimeout(this.timeoutLock)
                this.timeoutLock = null
            }

            const settingStore = useSettingStore()

            if (settingStore.setting.timeoutLock === 0) {
                return
            }
            this.timeoutLock = setTimeout(() => {
                if (settingStore.setting.timeoutLock && this.serviceStatus === ServiceStatus.UNLOCKED && !settingStore.setting.autoUnlock) {
                    console.log('超时自动锁定')
                    this.passwordManager.lock();
                    let refStore = useRefStore()
                    refStore.settingRef?.closeSetting()
                    refStore.passwordFormRef?.closePasswordForm()
                }
            }, settingStore.setting.timeoutLock * 1000);
        },

    },
})