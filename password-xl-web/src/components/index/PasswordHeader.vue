<!--密码列表头组件-->
<script setup lang="ts">
import {PasswordDisplayMode, ServiceStatus, TopicMode} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {displaySize} from "@/utils/global.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

// 搜索文本
const searchText: Ref<string> = ref('')
// 中文输入法输入中
const inputIng: Ref<boolean> = ref(false)

// 过滤密码
const filterPassword = (str?: string) => {
  console.log('header 过滤密码 searchText:', searchText.value, ' 触发方式：' + str)
  passwordStore.filterCondition.searchText = searchText.value
}

// 保存搜索记录
const saveSearchLog = () => {
  if (!searchText.value || !searchText.value.trim()) {
    // 搜索字符串为空不保存
    return
  }
  console.log('header 保存搜索记录：', searchText.value)

  let searchHistory: Array<string> = [];
  let searchHistoryStr = localStorage.getItem('searchHistory')
  if (searchHistoryStr) {
    searchHistory = JSON.parse(searchHistoryStr)
  }
  let index = searchHistory.findIndex((text: string) => text === searchText.value.trim())
  if (index > -1) {
    console.log('header 保存搜索记录 删除已存在的搜索历史')
    // 删除已存在的搜索历史
    searchHistory.splice(index, 1)
  }
  // 蒋搜索内容放到历史中的第一位
  searchHistory.unshift(searchText.value)
  if (searchHistory.length > 100) {
    // 搜索历史最大保存数量，防止过多
    searchHistory = searchHistory.splice(0, 100)
  }
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory))
}

// 自动补全
const querySearch = (queryString: string, cb: any) => {
  if (!queryString) {
    cb([])
    return;
  }
  console.log('header 自动补全：', queryString);
  let searchHistory = localStorage.getItem('searchHistory')
  if (searchHistory) {
    let array = JSON.parse(searchHistory)
    if (array && array.length > 0) {
      let historyArray = queryString ? array.filter((text: string) => text.includes(queryString)) : array
      historyArray = historyArray.slice(0, 5)
      let result = historyArray.map(((text: string) => {
        return {value: text}
      }))
      result.push({value: searchText.value, type: 'cleanHistory'})
      cb(result)
      return
    }
  }
  cb([])
}

// 清除搜索历史
const clearSearchHistory = () => {
  console.log('header 清除搜索历史')
  localStorage.removeItem('searchHistory')
}

// 延时过滤密码
let searchTimeout: any = null
const delayedSearch = () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  if (searchText.value === '' && !inputIng.value) {
    // 字符串已清空立即过滤密码
    filterPassword('textBlank')
    return
  }

  // 延时0.2秒开始过滤密码
  searchTimeout = setTimeout(function () {
    filterPassword('delayed')
  }, 200);
}

// 添加密码
const addPassword = () => {
  console.log('header 添加密码')
  refStore.passwordFormRef.addPasswordForm()
}

// 解锁
const unlock = () => {
  console.log('header 解锁')
  refStore.verifyPasswordRef.verifyAndUnlock()
}

// 锁定
const lock = () => {
  passwordStore.passwordManager.lock()
}

// 切换密码展示方式
const switchDisplayMode = (displayMode: PasswordDisplayMode) => {
  settingStore.setting.passwordDisplayMode = displayMode
  passwordStore.passwordManager.syncSetting()
}

// 切换主题
const switchTopicMode = (topicMode: TopicMode) => {
  passwordStore.setTopicMode(topicMode)
}

// 打开回收站
const openRecycleBin = () => {
  refStore.recycleBinRef.openRecycleBin()
}

// 介绍页
const goAbout = () => {
  location.href = 'https://password-xl.cn/about'
}

</script>

<template>
  <div class="password-card-header">
    <div>
      <el-text class="hidden-sm-and-down password-title" style="width: 300px" v-if="settingStore.setting.showPasswordStatistics">
        <template v-if="passwordStore.visPasswordArray.length > 0">
          <span>
            共
          </span>
          <span class="password-count">
            {{ passwordStore.visPasswordArray.length }}
          </span>
          <span>
            个密码
          </span>
        </template>
        <template v-else-if="!passwordStore.passwordArray.length">
          没有保存的密码
        </template>
      </el-text>
      <div v-else class="hidden-xs-only" style="height: 32px" @click="goAbout">
        <img alt="" style="height: 32px;cursor: pointer" src="../../assets/images/logo.svg">
      </div>
    </div>
    <div style="display: flex;">
      <el-autocomplete
          v-model="searchText"
          class="search-input"
          clearable
          placeholder="搜索.."

          :disabled="passwordStore.serviceStatus !== ServiceStatus.UNLOCKED"
          :fetch-suggestions="querySearch"
          :debounce="10"
          :ref="(el: any) => refStore.searchInputRef = el"

          @change="filterPassword('change')"
          @clear="filterPassword('clear')"
          @keyup.enter.native="filterPassword('inputEnter')"
          @keyup="delayedSearch"
          @compositionstart="inputIng = true"
          @compositionend="inputIng = false"
          @blur="inputIng = false;saveSearchLog()"
      >
        <template #default="{ item }">
          <div v-if="item.type === 'cleanHistory'" style="text-align: center;margin-left: -20px;margin-right: -20px;" class="clear-history">
            <span @click="clearSearchHistory" class="clear-history-text">清除搜索历史</span>
          </div>
          <div v-else>
            {{ item.value }}
          </div>
        </template>
        <template #append>
          <el-button class="search-btn" @click="filterPassword('searchBtn')">
            <span class="iconfont icon-search search-input-icon"/>
          </el-button>
        </template>
      </el-autocomplete>
    </div>
    <div style="display: flex;">
      <el-button
          :ref="(el: any) => refStore.createPasswordBtnRef = el"
          :disabled="passwordStore.serviceStatus !== ServiceStatus.UNLOCKED"
          @click="addPassword"
          class="add-password-btn"
          type="primary"
          plain>
        创建密码
      </el-button>
      <el-tooltip content="锁定" v-if="passwordStore.serviceStatus === ServiceStatus.UNLOCKED">
        <el-button @click="lock" class="lock-btn" plain>
          <span class="iconfont icon-lock" style="font-size: 120%;" :style="{'color':passwordStore.isDark?'#ccc':'#666'}"/>
        </el-button>
      </el-tooltip>
      <el-tooltip content="解锁" v-if="passwordStore.serviceStatus === ServiceStatus.LOGGED">
        <el-button @click="unlock" class="unlock-btn" plain>
          <span class="iconfont icon-unlock" style="font-size: 120%;" :style="{'color':passwordStore.isDark?'#ccc':'#666'}"/>
        </el-button>
      </el-tooltip>
      <el-tooltip content="列表视图" v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.CARD">
        <el-button @click="switchDisplayMode(PasswordDisplayMode.TABLE)" :ref="(el: any) => refStore.displayModeTableRef = el" class="table-btn hidden-sm-and-down" plain>
          <span class="iconfont icon-list" style="color: #409eff;font-size: 130%;"/>
        </el-button>
      </el-tooltip>
      <el-tooltip content="卡片视图" v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.TABLE">
        <el-button @click="switchDisplayMode(PasswordDisplayMode.CARD)" :ref="(el: any) => refStore.displayModeCardRef = el" class="card-btn hidden-sm-and-down" plain>
          <span class="iconfont icon-card" style="color: #67c23a;font-size: 130%;"/>
        </el-button>
      </el-tooltip>
      <el-dropdown trigger="click">
        <el-button class="menu-btn" :style="{'color':passwordStore.isDark?'#ccc':'#666'}" plain>
          <span class="iconfont icon-menu" style="font-size: 130%;"/>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
                @click="refStore.labelDrawer?.showLabelDrawer"
                :disabled="passwordStore.serviceStatus !== ServiceStatus.UNLOCKED"
                v-if="['xs','sm'].includes(displaySize().value) || !settingStore.setting.showLabelCard">
              <span class="iconfont icon-label menu-item" style="color: #409EFF"></span>
              标签
            </el-dropdown-item>
            <el-dropdown-item
                @click="refStore.favoriteDrawer?.showFavoriteDrawer"
                :disabled="passwordStore.serviceStatus !== ServiceStatus.UNLOCKED"
                v-if="['xs','sm'].includes(displaySize().value) || !settingStore.setting.showFavoriteCard">
              <span class="iconfont icon-collect menu-item" style="color: #FF9700"></span>
              收藏
            </el-dropdown-item>
            <el-dropdown-item
                :divided="['xs','sm'].includes(displaySize().value) || !settingStore.setting.showFavoriteCard || !settingStore.setting.showLabelCard"
                v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.TABLE
                && ['xs','sm'].includes(displaySize().value)"
                @click="settingStore.setting.passwordDisplayMode = PasswordDisplayMode.CARD"
            >
              <span class="iconfont icon-card menu-item" style="color: #67c23a"></span>
              卡片视图
            </el-dropdown-item>
            <el-dropdown-item
                v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.CARD
                && ['xs','sm'].includes(displaySize().value)"
                @click="settingStore.setting.passwordDisplayMode = PasswordDisplayMode.TABLE"
            >
              <span class="iconfont icon-list menu-item" style="color: #409eff"></span>
              列表视图
            </el-dropdown-item>
            <el-dropdown-item
                :divided="['xs','sm'].includes(displaySize().value)"
                @click="switchTopicMode(TopicMode.DARK)"
                v-if="!passwordStore.isDark"
            >
              <span class="iconfont icon-dark-mode menu-item" style="color: rgb(96 0 255)"></span>
              深色主题
            </el-dropdown-item>
            <el-dropdown-item
                :divided="['xs','sm'].includes(displaySize().value)"
                @click="switchTopicMode(TopicMode.LIGHT)"
                v-if="passwordStore.isDark"
            >
              <span class="iconfont icon-right-mode menu-item" style="color: rgb(186 255 0)"></span>
              明亮主题
            </el-dropdown-item>
            <el-dropdown-item
                divided
                @click="refStore.settingRef?.openSetting"
                :disabled="passwordStore.serviceStatus !== ServiceStatus.UNLOCKED">
              <span class="iconfont icon-setting menu-item" style="color: #409EFF"></span>
              系统设置
            </el-dropdown-item>
            <el-dropdown-item @click="openRecycleBin" :disabled="passwordStore.serviceStatus !== ServiceStatus.UNLOCKED">
              <span class="iconfont icon-recycle-bin menu-item" style="color: #E6A23C;"></span>
              回收站
            </el-dropdown-item>
            <el-dropdown-item divided @click="passwordStore.logout()">
              <span class="iconfont icon-exit menu-item" style="color: #F56C6C"></span>
              退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
  <el-divider class="password-head-body-line"></el-divider>
</template>

<style scoped>
.password-count {
  font-weight: bold;
}

.search-input {
  height: 32px;
}

.search-btn:hover {
  color: #fff !important;
  border-radius: 0 4px 4px 0 !important;
  background-color: rgb(110, 181, 255) !important;
}

.search-btn:active {
  color: #fff !important;
  border-radius: 0 4px 4px 0 !important;
  background-color: #409EFF !important;
}

:deep(.search-input) {
  max-width: 360px;
  min-width: 150px;
  width: 22vw;
}

.clear-history:hover {
  color: #F56C6C;
  padding: 0;
}

.clear-history-text {
  font-size: 90%;
}

.password-card-header {
  display: flex;
  padding: 13px;
  justify-content: space-between;
}

.password-title {
  font-size: 17px;
  line-height: 34px;
}

.menu-item {
  margin-right: 10px;
}

.search-input-icon {
  font-size: 120%
}

.add-password-btn {
  margin-left: 10px
}

.lock-btn, .unlock-btn, .table-btn, .card-btn {
  margin-left: 10px;
  color: #666;
}

.menu-btn {
  margin-left: 10px;
}

.password-head-body-line {
  margin-top: 0;
  margin-bottom: 0;
}

</style>
<style>


</style>