import {defineStore} from "pinia";
import {RefStore} from "@/types";

export const useRefStore = defineStore('refStore', {
    state: (): RefStore => {
        return {
            // 验证密码
            verifyPasswordRef: ref(),
            // 密码表单
            passwordFormRef: ref(),
            // 注销账号
            cancelAccountRef: ref(),
            // 设置
            settingRef: ref(),
            // 标签树
            labelTreeRef: ref(),
            // 标签树外部Div
            labelTreeDivRef: ref(),
            // 设置密码
            setPasswordRef: ref(),
            // 回收站
            recycleBinRef: ref(),
            // 备份与恢复
            backupAndRecoveryRef: ref(),
            // 快速登录提示
            fastLoginRef: ref(),
            // Ai解析密码组件
            aiAddPasswordRef: ref(),
            // 标签抽屉
            labelDrawer: ref(),
            // 收藏抽屉
            favoriteDrawer: ref(),
            // 新手引导
            tourRef: ref(),
            // 查看密码
            showPasswordRef: ref(),
            // 密码导出
            exportExcelRef: ref(),
            // 密码导入
            importExcelRef: ref(),
            // 右键菜单
            contextmenuRef: ref(),
            // 创建密码按钮
            createPasswordBtnRef: ref(),
            // Ai创建密码按钮
            aiCreatePasswordBtnRef: ref(),
            // 密码表单
            passwordFormFormRef: ref(),
            // 密码表单标题录入框
            passwordFormTitleRef: ref(),
            // 密码表单随机按钮
            passwordFormGenerateBtnRef: ref(),
            // 密码表单密码生成规则
            passwordFormGenerateRuleRef: ref(),
            // 密码表单保存按钮
            passwordFormSaveBtnRef: ref(),
            // 密码列表卡片视图
            displayModeCardRef: ref(),
            // 密码列表表格视图
            displayModeTableRef: ref(),
            // 搜索框
            searchInputRef: ref(),
        }
    }
})