<!--设置组件-->
<script lang="ts" setup>

import {displaySize} from "@/utils/global.ts";
import {GenerateRule, Password, Sort, TopicMode} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {browserFingerprint, encryptAES} from "@/utils/security.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {useLoginStore} from "@/stores/LoginStore.ts";
import {TabPaneName} from "element-plus";

import packageJson from '../../../../package.json'

const passwordStore = usePasswordStore()
const settingStore = useSettingStore()
const loginStore = useLoginStore()
const refStore = useRefStore()

// 是否已验证密码
const authenticated = ref(false);

// 主题设置
const topicMode: Ref<TopicMode> = ref(TopicMode.AUTO)

// 打开设置
const openSetting = () => {
  console.log('打开设置')
  let localTopicMode = localStorage.getItem("topicMode");
  if (!localTopicMode) {
    topicMode.value = TopicMode.AUTO
  } else {
    topicMode.value = localTopicMode as TopicMode
  }
  settingStore.visSetting = true
  authenticated.value = false
}

// 关闭设置
const closeSetting = () => {
  console.log('关闭设置')
  settingStore.visSetting = false
}

// 滚动条高度
const scrollbarHeight = () => {
  return ['xs', 'sm'].includes(displaySize().value) ? 'calc(100vh - 120px)' : '500px'
}

// 自动登录状态改变前钩子
const changeAutoLock = (): Promise<boolean> => {
  console.log('设置，自动登录状态改变前钩子')
  if (settingStore.setting.autoUnlock) {
    return Promise.resolve(true)
  }
  let content = `为了您的账号安全，建议您不要开启记住主密码功能。开启后任何人打开您设备的password-XL时，都可以直接访问解锁后的密码列表，极大地增加了密码泄露的风险。\n如您仍需开启此功能，请务必妥善保存并牢记您的主密码。当您更换设备或浏览器指纹发生变更时，仍需您手动登录并使用主密码解锁。`;
  return new Promise(async (resolve) => {
    console.log('设置，显示重要安全提示')
    ElMessageBox({
      title: '重要安全提示',
      message: h('div', {class: 'el-alert el-alert--error is-light', style: 'text-indent: 20px;'}, content),
      showConfirmButton: true,
      confirmButtonText: '确认开启',
      confirmButtonClass: 'el-button--danger'
    })
        .then(() => {
          console.log('设置，显示重要安全提示，验证身份')
          refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then((mainPassword: string) => {
            resolve(true)
            console.log('设置，保存自动解锁主密码')
            localStorage.setItem('mainPassword', encryptAES(browserFingerprint(), mainPassword))
          })
        })
        .catch(() => resolve(false))
  })
}

// 回收站状态改变前钩子
const changeRecycle = (): Promise<boolean> => {
  console.log('设置，回收站状态改变前钩子')
  if (!settingStore.setting.enableRecycleBin || !passwordStore.deletedArray.length) {
    return Promise.resolve(true)
  }
  let content = `关闭回收站将立即清空回收站中所有密码`;
  return new Promise(async (resolve, reject) => {
    ElMessageBox({
      message: content,
      showConfirmButton: true,
      confirmButtonText: '清空',
      type: 'warning',
      showCancelButton: true,
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    })
        .then(() => {
          console.log('设置，回收站状态改变前钩子，确认')
          resolve(true)
        })
        .catch(() => {
          console.log('设置，回收站状态改变前钩子，取消')
          reject()
        })
  })
}

// 切换标签之前的钩子函数
const switchTab = (activeName: TabPaneName): Promise<boolean> => {
  console.log('设置，切换标签之前的钩子函数 activeName：', activeName, ' loginStore.loginType：', loginStore.loginType)
  if (authenticated.value) {
    return Promise.resolve(true);
  }
  if (activeName === 'loginInfo' && !['local', 'electron'].includes(loginStore.loginType)) {
    console.log('设置，切换登录信息，验证密码')
    return new Promise((resolve, reject) => {
      refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then(() => {
        resolve(true)
        console.log('设置，切换登录信息，验证密码通过')
        authenticated.value = true
      }).catch((err: any) => {
        console.error('设置，切换登录信息，验证密码异常', err)
        reject()
      })
    });
  } else {
    return Promise.resolve(true);
  }
}

defineExpose({
  openSetting,
  closeSetting
})

// 监听显示标签卡片设置变更
watch(() => settingStore.setting.showLabelCard, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('显示标签卡片设置变更:', newValue)
  passwordStore.passwordManager.syncSetting().then((resp) => {
    if (resp.status) {
      // 清空密码列表过滤条件
      refStore.labelTreeRef?.setCheckedNodes([])
    }
  })
})

// 监听动态背景图设置变更
watch(() => settingStore.setting.dynamicBackground, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('动态背景图设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听显示收藏卡片设置变更
watch(() => settingStore.setting.showFavoriteCard, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('显示收藏卡片设置变更:', newValue)
  passwordStore.passwordManager.syncSetting().then((resp) => {
    if (resp.status) {
      // 清空密码列表过滤条件
      passwordStore.filterCondition.favoriteId = 0
    }
  })
})

// 监听密码回收站设置变更
watch(() => settingStore.setting.enableRecycleBin, (newValue: boolean, oldValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('密码回收站设置变更:', newValue, oldValue)
  passwordStore.passwordManager.syncSetting().then((resp) => {
    if (resp.status) {
      if (!newValue) {
        passwordStore.passwordManager.emptyRecycle()
      }
    }
  })
})

// 监听快捷键设置变更
watch(() => settingStore.setting.enableShortcutKey, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('快捷键设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听排序字段设置变更
watch(() => settingStore.setting.sortField, (newValue: keyof Password) => {
  if (!settingStore.visSetting) return
  console.log('排序字段设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听排序顺序设置变更
watch(() => settingStore.setting.sortOrder, (newValue: string) => {
  if (!settingStore.visSetting) return
  console.log('排序顺序设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听密码列表中显示标签设置变更
watch(() => settingStore.setting.showLabelForTable, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('密码列表中显示标签设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听AI创建密码设置变更
watch(() => settingStore.setting.enableAiAdd, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('AI创建密码设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听密码列表中显示时间设置变更
watch(() => settingStore.setting.showTimeForTable, (newValue: string) => {
  if (!settingStore.visSetting) return
  console.log('密码列表中显示时间设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听显示密码强度设置变更
watch(() => settingStore.setting.showStrength, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('显示密码强度设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听超时锁定设置变更
watch(() => settingStore.setting.timeoutLock, (newValue: number) => {
  if (!settingStore.visSetting) return
  console.log('超时锁定设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听自动登录设置变更
watch(() => settingStore.setting.autoLogin, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('自动登录设置变更:', newValue)
  passwordStore.passwordManager.syncSetting().then((resp) => {
    if (resp.status) {
      if (!newValue) {
        console.log('自动登录设置变更 同步后')
        sessionStorage.removeItem('loginInfo')
        localStorage.removeItem('loginInfo')
        ElNotification.success({title: '已关闭自动登录', message: '自动登录信息已清除！'})
        settingStore.setting.autoUnlock = false
      } else {
        ElNotification.success({title: '已开启自动登录', message: '在您下次登录时将系统将记住登录信息！'})
      }
    }
  })
})

// 监听自动解锁设置变更
watch(() => settingStore.setting.autoUnlock, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('自动解锁设置变更:', newValue)
  passwordStore.passwordManager.syncSetting().then((resp) => {
    if (resp.status) {
      if (!newValue) {
        localStorage.removeItem('mainPassword')
        ElMessage.success('已清除主密码信息');
      } else {
        settingStore.setting.autoLogin = true
        ElMessage.success('已开启自动解锁');
        settingStore.setting.timeoutLock = 0
      }
    }
  })
})

// 监听验证密码显示手势设置变更
watch(() => settingStore.setting.verifyShowGesture, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('验证密码显示手势设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
  localStorage.setItem('showGesture', newValue + '')
})

// 监听主题设置变更
watch(() => topicMode.value, (newValue: TopicMode) => {
  if (!settingStore.visSetting) return
  console.log('主题设置变更:', newValue)
  passwordStore.setTopicMode(newValue)
})

// 监听易混淆字符设置变更
let easyConfuseChatChangeDelay: any = null;
watch(() => settingStore.setting.easyConfuseChat, (newValue: string) => {
  if (!settingStore.visSetting) return
  if (easyConfuseChatChangeDelay) {
    clearTimeout(easyConfuseChatChangeDelay)
  }
  easyConfuseChatChangeDelay = setTimeout(() => {
    console.log('易混淆字符设置变更:', newValue);
    passwordStore.passwordManager.syncSetting()
  }, 300)
})

// 监听自动生成密码设置变更
watch(() => settingStore.setting.autoGeneratePassword, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('自动生成密码设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听显示密码颜色设置变更
watch(() => settingStore.setting.passwordColor, (newValue: boolean) => {
  if (!settingStore.visSetting) return
  console.log('显示密码颜色设置变更:', newValue)
  passwordStore.passwordManager.syncSetting()
})

// 监听默认密码生成规则设置变更
let generateRuleChangeDelay: any = null;
watch(() => settingStore.setting.generateRule, (newValue: GenerateRule) => {
  if (!settingStore.visSetting) return
  if (generateRuleChangeDelay) {
    clearTimeout(generateRuleChangeDelay)
  }
  generateRuleChangeDelay = setTimeout(() => {
        console.log('默认密码生成规则设置变更:', newValue)
        passwordStore.passwordManager.syncSetting()
      },
      300);
}, {
  deep: true
})

const isAndroid = () => {
  return !!window.androidAPI
}

</script>

<template>
  <el-dialog
      v-model="settingStore.visSetting"
      :fullscreen="['xs', 'sm'].includes(displaySize().value)"
      draggable

      width="750px">
    <template #header>
      <el-text size="large" style="user-select: none;">
        <span class="iconfont icon-setting"></span>
        设置
      </el-text>
    </template>
    <el-form v-model="settingStore" label-position="right" label-width="140px">
      <el-tabs :before-leave="switchTab" style="margin-top: 10px;" tab-position="left">
        <el-tab-pane>
          <template #label>
            <el-text>
              <span class="iconfont icon-personalization action-icon" style="color: #FF5733"></span>
              <span style="letter-spacing: 3px">&nbsp;个性化</span>
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">主题</el-text>
                <el-select v-model="topicMode" size="small" style="width: 100px;">
                  <el-option :value="TopicMode.AUTO" label="跟随系统"/>
                  <el-option :value="TopicMode.LIGHT" label="明亮主题"/>
                  <el-option :value="TopicMode.DARK" label="深色主题"/>
                </el-select>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                您可以根据个人喜好选择明亮或深色主题，也可以设置为跟随系统
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">显示背景图</el-text>
                <el-switch v-model="settingStore.setting.dynamicBackground"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                用于控制是否显示首页动态背景图，若浏览器卡顿您可以关闭动态背景图
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">易混淆字符</el-text>
                <el-input v-model="settingStore.setting.easyConfuseChat" size="small" style="width: 100px;"></el-input>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                随机生成密码时将不会使用配置的易混淆字符
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">自动生成密码</el-text>
                <el-switch v-model="settingStore.setting.autoGeneratePassword"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                当您添加密码时是否希望系统使用默认规则自动生成一个密码
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">随机密码生成规则</el-text>
              </div>
              <el-divider class="function-line"/>
              <div style="margin-top: 10px;">
                <div>
                  <el-row>
                    <el-col :md="{span:10}" :sm="{span:24}" style="margin-bottom: 10px;text-align: center;">
                      <el-checkbox v-model="settingStore.setting.generateRule.uppercase" border label="大写" size="small"
                                   style="margin: 5px 15px;"/>
                      <el-checkbox v-model="settingStore.setting.generateRule.lowercase" border label="小写" size="small"
                                   style="margin: 5px 15px;"/>
                      <el-checkbox v-model="settingStore.setting.generateRule.number" border label="数字" size="small"
                                   style="margin: 5px 15px;"/>
                      <el-checkbox v-model="settingStore.setting.generateRule.symbol" border label="符号" size="small"
                                   style="margin: 5px 15px;"/>
                    </el-col>
                    <el-col :md="{span:10}" :sm="{span:24}" style="text-align: center">
                      <span>密码长度</span>
                      <el-slider v-model="settingStore.setting.generateRule.length" :max="32"
                                 :min="4" size="small" style="margin-top: 10px"/>
                    </el-col>
                  </el-row>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane>
          <template #label>
            <el-text>
              <span class="iconfont icon-function action-icon" style="color: #FF33FF"></span>
              功能管理
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">启用AI创建</el-text>
                <el-switch v-model="settingStore.setting.enableAiAdd"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                在首页启用AI创建密码，AI创建可以把包含账号信息的文本解析成结构化的密码。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">显示标签卡片</el-text>
                <el-switch v-model="settingStore.setting.showLabelCard"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                显示标签卡片后，您可以在首页方便地管理所有标签，并使用标签功能筛选密码列表。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">显示收藏卡片</el-text>
                <el-switch v-model="settingStore.setting.showFavoriteCard"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                显示收藏卡片后，您可以在首页查看所有已收藏的密码，点击密码名称即可在密码列表中显示。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">密码回收站</el-text>
                <el-switch v-model="settingStore.setting.enableRecycleBin" :before-change="changeRecycle"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                开启密码回收站后，已删除的密码将会被保存至回收站，您可以选择永久删除或恢复。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">快捷键</el-text>
                <el-switch v-model="settingStore.setting.enableShortcutKey"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                锁定/解锁：
                <el-tag size="small" style="text-indent:0;margin-right: 10px;" type="primary">Alt + L</el-tag>
                搜索：
                <el-tag size="small" style="text-indent:0;margin-right: 10px;" type="primary">Ctrl + F</el-tag>
                创建：
                <el-tag size="small" style="text-indent:0;margin-right: 10px;" type="primary">Alt + N</el-tag>
                保存：
                <el-tag size="small" style="text-indent:0;margin-right: 10px;" type="primary">Ctrl + S</el-tag>
              </el-text>
            </div>
            <el-alert :closable="false" show-icon title="若您需要更多密码显示空间，可以选择关闭标签和收藏卡片并在更多功能中使用。"
                      type="info"></el-alert>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane>
          <template #label>
            <el-text>
              <span class="iconfont icon-display action-icon" style="color: #00e329"></span>
              密码显示
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">密码排序</el-text>
                <div>
                  <el-select v-model="settingStore.setting.sortField" size="small" style="width: 90px;">
                    <el-option label="添加时间" value="addTime"/>
                    <el-option label="修改时间" value="updateTime"/>
                    <el-option label="密码强度" value="strength"/>
                    <el-option label="密码名称" value="title"/>
                    <el-option label="登录名" value="username"/>
                    <el-option label="收藏" value="favorite"/>
                  </el-select>
                  <el-select v-model="settingStore.setting.sortOrder" size="small" style="width: 65px;margin-left: 5px">
                    <el-option :value="Sort.ASC" label="正序"/>
                    <el-option :value="Sort.DESC" label="倒序"/>
                  </el-select>
                </div>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                此选项用于设置密码默认排序规则。您也可以通过点击密码列表中的小箭头进行临时排序，临时排序会在页面刷新后重置。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">在密码列表中显示标签</el-text>
                <el-switch v-model="settingStore.setting.showLabelForTable"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                此选项用于设置是否在密码列表中显示标签列，显示标签将会占用更多空间，您可根据需要开启。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">在密码列表中显示时间</el-text>
                <el-select v-model="settingStore.setting.showTimeForTable" size="small" style="width: 100px;">
                  <el-option label="不显示时间" value="no"/>
                  <el-option label="显示添加时间" value="addTime"/>
                  <el-option label="显示修改时间" value="updateTime"/>
                </el-select>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                此选项用于设置是否在密码列表中显示时间，显示时间将会占用更多空间，您可根据需要开启。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">显示密码强度</el-text>
                <el-switch v-model="settingStore.setting.showStrength"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                我们根据密码组成将密码分为弱、中、强3个等级，分别用颜色
                <div class="password-strength" style="background-color: #F56C6C;"></div>
                <div class="password-strength" style="background-color: #FF9700;"></div>
                <div class="password-strength" style="background-color: #67C23A;"></div>
                表示，若您不喜欢此功能可在此关闭。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">密码颜色</el-text>
                <el-switch v-model="settingStore.setting.passwordColor"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                开启此功能后您可以在创建密码时选择密码颜色，并在卡片或表格中显示
              </el-text>
            </div>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane>
          <template #label>
            <el-text>
              <span class="iconfont icon-verify action-icon" style="color: #33CFFF"></span>
              密码安全
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">超时锁定</el-text>
                <el-select v-model="settingStore.setting.timeoutLock"
                           :disabled="settingStore.setting.autoUnlock"
                           :title="settingStore.setting.autoUnlock?'已开启自动解锁无法设置自动锁定':''" size="small" style="width: 100px;">
                  <el-option :value="0" label="永不超时"/>
                  <el-option :value="30" label="30秒"/>
                  <el-option :value="60" label="1分钟"/>
                  <el-option :value="300" label="5分钟"/>
                  <el-option :value="600" label="10分钟"/>
                  <el-option :value="1800" label="30分钟"/>
                  <el-option :value="3600" label="1小时"/>
                  <el-option :value="14400" label="4小时"/>
                  <el-option :value="28800" label="8小时"/>
                  <el-option :value="43200" label="12小时"/>
                </el-select>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                系统将在此时间后自动锁定密码列表。
              </el-text>
            </div>
            <div v-if="loginStore.loginType !== 'local'" class="function-div">
              <div class="function-header">
                <el-text tag="b">自动登录</el-text>
                <el-switch v-model="settingStore.setting.autoLogin"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                开启自动登录功能后，系统会将您的登录信息通过浏览器指纹加密后存储在浏览器中。当您再次打开password-XL并成功验证主密码时，系统会自动登录。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">自动解锁</el-text>
                <el-switch v-model="settingStore.setting.autoUnlock" :before-change="changeAutoLock"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                开启自动解锁功能后，系统会将您的主密码通过浏览器指纹加密后存储在浏览器中。当您再次打开password-XL时，系统会自动登录并使用主密码解锁。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">验证密码时显示手势</el-text>
                <el-switch v-model="settingStore.setting.verifyShowGesture"></el-switch>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                当您使用手势密码时可以在此配置是否显示手势滑动轨迹。
              </el-text>
            </div>
            <div class="function-div" style="display: flex;justify-content: space-evenly;">
              <el-button plain type="primary" @click="refStore.setPasswordRef.setMainPassword">修改主密码</el-button>
              <el-button type="danger" @click="refStore.cancelAccountRef.showCloseAccount">注销账户</el-button>
            </div>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane name="loginInfo">
          <template #label>
            <el-text>
              <span class="iconfont icon-info action-icon" style="color: #409EFF"></span>
              登录信息
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div class="login-info">
              <LoginInfo></LoginInfo>
            </div>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane v-if="!isAndroid()">
          <template #label>
            <el-text>
              <span class="iconfont icon-recovery action-icon" style="color: #ffc400"></span>
              备份恢复
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <el-alert style="margin-bottom: 10px" type="warning">笔记数据不会被备份或导出，请注意</el-alert>
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">备份密码</el-text>
                <el-button plain size="small" type="primary" @click="refStore.backupAndRecoveryRef.backup(false)">备份
                </el-button>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                密码备份功能可以安全的将加密后的密码文件导出，在需要时通过
                <el-text>恢复备份密码</el-text>
                功能还原。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">恢复备份密码</el-text>
                <el-button plain size="small" type="primary" @click="refStore.backupAndRecoveryRef.recovery">恢复
                </el-button>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                此功能可以将备份文件中的密码恢复到密码列表。在验证备份文件的主密码后，您可以选择合并或覆盖方式恢复密码。
              </el-text>
            </div>

            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">导出密码</el-text>
                <el-button plain size="small" type="primary" @click="refStore.exportExcelRef.exportExcel(false)">导出
                  Excel
                </el-button>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                导出密码会将敏感信息明文存储在excel表格中，请注意密码安全。若您仅需要迁移账号或备份密码建议使用密码备份与恢复功能更加高效安全。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">导入密码</el-text>
                <el-button plain size="small" type="primary"
                           @click="refStore.importExcelRef && refStore.importExcelRef.importExcel">导入 Excel
                </el-button>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                密码导入功能支持按照密码模板导入excel文件中的密码，您可以通过下载模板功能获取密码模板。
              </el-text>
            </div>
            <div class="function-div">
              <div class="function-header" style="margin-bottom: 5px">
                <el-text tag="b">下载导入模板</el-text>
                <el-button plain size="small"
                           type="primary" @click="refStore.exportExcelRef && refStore.exportExcelRef.exportExcel(true)">下载
                </el-button>
              </div>
              <el-divider class="function-line"/>
              <el-text style="text-indent: 10px" tag="p" type="info">
                您可在下载的Excel模板中按照要求填写您的密码列表（
                <el-text type="danger">密码名称为必填</el-text>
                ），然后使用密码导入功能导入您的密码。
              </el-text>
            </div>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane>
          <template #label>
            <el-text>
              <span class="iconfont icon-problem action-icon" style="color: #FF69B4"></span>
              问题反馈
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div class="function-div">
              <div class="function-header">
                <el-text tag="b">建议反馈</el-text>
              </div>
              <el-divider class="function-line"/>
              <div style="margin-top: 10px">
                <el-text style="text-indent: 10px" tag="p">
                  您的建议是我们不断进步的动力，您可以在此项目
                  <el-link :href="packageJson.repository.url+'/issues'" style="position: relative;top: -2px" target="_blank"
                           type="primary">开源地址
                  </el-link>
                  中留下您遇到的问题或提出宝贵的建议。
                </el-text>
              </div>
            </div>
            <div class="function-div" style="margin-top: 30px">
              <div class="function-header">
                <el-text tag="b">常见问题</el-text>
              </div>
              <div style="margin-top: 5px">
                <CommonProblem></CommonProblem>
              </div>
            </div>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane>
          <template #label>
            <el-text>
              <span class="iconfont icon-about action-icon" style="color: #FF4500"></span>
              关于项目
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div style="padding: 0">
              <About></About>
            </div>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane>
          <template #label>
            <el-text>
              <span class="iconfont icon-coffee action-icon" style="color: #FF5858FF"></span>
              支持我们
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div style="padding: 0">
              <SupportMe></SupportMe>
            </div>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane>
          <template #label>
            <el-text>
              <span class="iconfont icon-copyright action-icon" style="color: #FF8C00"></span>
              版权声明
            </el-text>
          </template>
          <el-scrollbar :height="scrollbarHeight()">
            <div style="padding: 0 15px">
              <CopyrightNotice></CopyrightNotice>
            </div>
          </el-scrollbar>
        </el-tab-pane>
      </el-tabs>
    </el-form>
  </el-dialog>
</template>

<style scoped>
:deep(.el-tabs__item) {
  padding: 0 15px 0 5px;
}

.icon-setting {
  font-size: 110%;
  color: #409EFF;
  margin-right: 5px;
}

.el-alert {
  padding: 2px 10px;
  margin-top: 10px;
}

.function-div {
  padding: 0 15px 0 5px;
  margin-bottom: 25px;
}

.function-header {
  display: flex;
  justify-content: space-between;
}

.function-line {
  margin-top: 3px;
  margin-bottom: 3px
}

.password-strength {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-block;
  margin: 0 2px;
  position: relative;
  top: 2px;
}

.action-icon {
  margin-right: 5px;
}
</style>