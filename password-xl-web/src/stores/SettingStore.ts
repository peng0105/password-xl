import {defineStore} from "pinia";
import {PasswordDisplayMode, Setting, Sort} from "@/types";

export const useSettingStore = defineStore('settingStore', {
    state: (): {visSetting: boolean, setting: Setting } => {
        return {
            visSetting: false,
            setting: {
                // 自动生成密码
                autoGeneratePassword: true,
                // 自定义字段
                customFields: [],
                // 易混淆字符
                easyConfuseChat: '0OoIil',
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
                generateRule: {
                    length: 16,
                    lowercase: true,
                    number: true,
                    symbol: true,
                    uppercase: true
                },
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
                // 显示密码统计
                showPasswordStatistics: false,
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
                // 动态背景图
                dynamicBackground: true,
                // 密码颜色
                passwordColor: false,
            }
        }
    }
})