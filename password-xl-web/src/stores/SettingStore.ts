import {defineStore} from "pinia";
import {AiProvider, AiThinking, PasswordDisplayMode, Setting, Sort} from "@/types";
import {DEFAULT_EXCLUDED_CHARACTERS, defaultGenerateRule, defaultPasswordExclusions, normalizePasswordGenerationSettings} from '@/utils/passwordGenerator.ts'
import {resolveBackgroundMode} from '@/utils/background.ts'

export const defaultAiModelSetting = () => ({
    provider: AiProvider.OFFICIAL,
    apiBaseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    apiKey: '',
    thinking: AiThinking.DISABLED,
})

export const normalizeSetting = (setting: Setting, source: Partial<Setting> = setting) => {
    normalizePasswordGenerationSettings(setting, source)
    // 使用原始配置判断旧版开关，避免合并后的默认动态模式覆盖用户的关闭设置。
    setting.backgroundMode = resolveBackgroundMode(source.backgroundMode, source.dynamicBackground)
    setting.dynamicBackground = setting.backgroundMode !== 'off'
    setting.enablePrivacyMode = setting.enablePrivacyMode ?? false
    setting.aiModel = {
        ...defaultAiModelSetting(),
        ...(setting.aiModel || {}),
    }
    if (setting.aiModel.provider === AiProvider.DEEPSEEK) {
        setting.aiModel.apiBaseUrl = setting.aiModel.apiBaseUrl || 'https://api.deepseek.com'
        setting.aiModel.model = setting.aiModel.model || 'deepseek-v4-flash'
        setting.aiModel.thinking = setting.aiModel.thinking || AiThinking.DISABLED
    }
}

export const useSettingStore = defineStore('settingStore', {
    state: (): { visSetting: boolean, setting: Setting } => {
        const backgroundMode = resolveBackgroundMode(
            localStorage.getItem('backgroundMode'), localStorage.getItem('dynamicBackground'))
        return {
            visSetting: false,
            setting: {
                // 自动生成密码
                autoGeneratePassword: true,
                // 自定义字段
                customFields: [],
                // 易混淆字符
                easyConfuseChat: DEFAULT_EXCLUDED_CHARACTERS,
                passwordExclusions: defaultPasswordExclusions(),
                // 启用标签
                showLabelCard: true,
                // 启用AI创建
                enableAiAdd: true,
                // 启用收藏模块
                showFavoriteCard: true,
                // 启用密码回收站
                enableRecycleBin: false,
                // 启用快捷键
                enableShortcutKey: true,
                // 密码生成规则
                generateRule: defaultGenerateRule(),
                // 在列表中显示时间 no.不显示 addTime.添加时间 updateTime.修改时间
                showTimeForTable: 'no',
                // 显示标签
                showLabelForTable: true,
                // 显示密码强度
                showStrength: true,
                // 排序规则
                sortOrder: Sort.DESC,
                // 排序字段
                sortField: "addTime",
                // 超时锁定（秒）
                timeoutLock: 0,
                // 验证主密码时显示手势
                verifyShowGesture: true,
                // 密码展示方式
                passwordDisplayMode: PasswordDisplayMode.CARD,
                // 记住登录信息
                autoLogin: true,
                // 记住主密码
                autoUnlock: false,
                // 启用密码列表隐私模式
                enablePrivacyMode: false,
                // 显示密码统计
                showPasswordStatistics: false,
                // 显示笔记功能
                showNote: false,
                // 背景色选项
                bgColors: [
                    'rgb(255,0,0)',
                    'rgb(255,136,0)',
                    'rgb(115,255,0)',
                    'rgb(0,208,255)',
                    'rgb(95,0,255)',
                    'rgb(178,0,255)',
                    'rgb(0,0,0)',
                ],
                // 登录前也沿用上次的背景模式；未配置时默认为动态。
                backgroundMode,
                dynamicBackground: backgroundMode !== 'off',
                // 密码颜色
                passwordColor: false,
                // AI模型配置
                aiModel: defaultAiModelSetting(),
            }
        }
    }
})
