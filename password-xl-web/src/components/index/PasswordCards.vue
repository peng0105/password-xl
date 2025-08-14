<!--卡片式密码列表-->
<script lang="ts" setup>

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {
  copyText,
  displaySize,
  formatterDate,
  getBgColor,
  getPasswordLabelNames,
  getPasswordStrengthColor,
  getPasswordStrengthTip,
  isUrl,
  sharePassword
} from "@/utils/global.ts";
import {Password} from "@/types";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

const showPasswordId = ref(0)
const passwordCardScrollbar = ref()


// 收藏密码
const favoritePassword = (password: Password) => {
  console.log('收藏密码：', password.id)
  password.favorite = !password.favorite
  password.favoriteTime = Date.now()
  // 同步密码文件
  passwordStore.passwordManager.updatePassword(password)
}

// 查看密码
const showLongPassword = (password: Password) => {
  console.log('card 查看密码：', password.id)
  if (password.password.length > 40) {
    console.log('card 查看密码 长度大于40')
    // 长度大于40使用弹框展示
    refStore.showPasswordRef.showPassword(password)
    showPasswordId.value = 0
  } else {
    // 长度小于40直接在table中展示
    showPasswordId.value = password.id
  }
}

// 删除密码
const deletePassword = (password: Password) => {
  console.log('card 删除密码：', password.id)
  // 询问确认删除吗？
  ElMessageBox.confirm(
      '确认删除“' + password.title + '”吗？',
      '删除密码',
      {
        confirmButtonClass: 'confirm-delete-btn',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
  ).then(() => {
    console.log('card 确认删除：', password.id)
    passwordStore.passwordManager.deletePassword(password.id).then(resp => {
      if (!resp.status) {
        console.log('card 删除密码异常：', resp.message)
        ElNotification.error({title: '系统异常', message: resp.message})
      }
    })
  }).catch(() => {
  })
}

const getRowCount = (): number => {
  if (['xs'].includes(displaySize().value)) {
    return 1
  } else if (['sm', 'md'].includes(displaySize().value)) {
    return 2
  } else if (['lg'].includes(displaySize().value)) {
    return 3
  } else {
    return 4
  }
}

const cardStyle = (password: Password) => {
  let borderColor = passwordStore.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'
  if (!settingStore.setting.passwordColor) {
    return {
      'background-color': 'rgba(0,0,0,0)',
      'border-bottom': '1px solid ' + borderColor
    }
  }
  return {
    'background-color': getBgColor(password.bgColor, '0.06'),
    'border-bottom': password.bgColor ? '1px solid ' + getBgColor(password.bgColor, '0.06') : '1px solid ' + borderColor
  };
}

const getBackStype = () => {
  if (settingStore.setting.dynamicBackground) {
    return {'background-color': passwordStore.isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}
  } else {
    return {'background-color': passwordStore.isDark ? 'rgba(0,0,0,1)' : 'rgba(255,255,255,1)'}
  }
}

const pageIndex = ref(1)
const pageSize = ref(getRowCount() * 5)

const getPagePasswordArray = () => {
  return passwordStore.visPasswordArray.slice(0, pageIndex.value * pageSize.value)
}

const scrollLoad = () => {
  const scrollbarWrap = passwordCardScrollbar.value.wrapRef;
  if (scrollbarWrap.scrollTop + scrollbarWrap.clientHeight >= scrollbarWrap.scrollHeight - 200) {
    if (pageIndex.value * pageSize.value < passwordStore.visPasswordArray.length) {
      pageIndex.value++
    }
  }
}

const listenerScroll = () => {
  const scrollbarWrap = passwordCardScrollbar.value.wrapRef;
  scrollbarWrap.addEventListener("scroll", () => {
    scrollLoad()
  });
}

onMounted(() => {
  scrollLoad()
  listenerScroll()
})

</script>

<template>
  <el-scrollbar
      ref="passwordCardScrollbar"
      height="calc(100vh - 85px)"
  >
    <div
        v-if="passwordStore.visPasswordArray.length"
        :style="{'grid-template-columns':'repeat('+getRowCount()+', 1fr)'}"
        style="display: grid;padding: 6px;">
      <div v-for="password in getPagePasswordArray()">
        <el-card :style="getBackStype" body-style="height: 100%;" class="password-card">
          <template #header>
            <div :style="cardStyle(password)" class="password-header-div">
              <div>
                <el-tooltip v-if="settingStore.setting.showStrength && password.password"
                            :content="getPasswordStrengthTip(password.password)" placement="top">
                  <div
                      :style="{'background-color':getPasswordStrengthColor(password.password)}"
                      class="password-strength"
                  ></div>
                </el-tooltip>
                <el-text style="font-size: 17px">{{ password.title }}</el-text>
              </div>
              <div>
                <el-tooltip :content="password.favorite?'取消收藏':'收藏'" placement="top">
                    <span
                        :class="password.favorite?'icon-favorited':'icon-collect'"
                        :style="{'color':password.favorite?'#FF9700':'rgb(255 151 0 / 75%)'}"
                        class="iconfont icon-favorited card-opt-icon"
                        style="font-size: 115%;"
                        @click="favoritePassword(password)"
                    />
                </el-tooltip>
              </div>
            </div>
          </template>
          <ul class="password-field-ul" style="height: 100%;">
            <li v-if="
            !password.address
            && !password.username
            && !password.password
            && !password.remark
            && !password.labels.length
            && !(password.customFields && password.customFields.length > 0)" class="empty-card">
              <el-text style="margin: 20px 0">
                空空如也！
              </el-text>
            </li>
            <li v-if="password.address">
              <el-text class="password-field-name">地址:</el-text>
              <el-text class="password-field-value">
                <el-link v-if="isUrl(password.address)" :href="password.address" target="_blank" type="primary">
                  {{ password.address }}
                </el-link>
                <el-text v-else>
                  {{ password.address }}
                </el-text>
              </el-text>
              <div class="clear"></div>
            </li>
            <li v-if="password.username">
              <el-text class="password-field-name">用户名:</el-text>
              <el-text class="password-field-value">
                <div class="card-username-div">
                  {{ password.username }}
                  <el-tooltip :hide-after="0" :show-after="300" content="复制用户名" placement="top">
                    <span class="iconfont icon-copy password-row-icon copy-username"
                          @click="copyText(password.username)"></span>
                  </el-tooltip>
                </div>
              </el-text>
              <div class="clear"></div>
            </li>
            <li v-if="password.password">
              <el-text class="password-field-name">密码:</el-text>
              <el-text class="password-field-value">
                <span v-if="showPasswordId === password.id" class="card-password-span">{{ password.password }}</span>
                <span v-else style="position: relative;top: 3px;">**********</span>
                <span v-if="showPasswordId === password.id" class="iconfont icon-hide password-card-icon"
                      @click="showPasswordId = 0"/>
                <span v-else class="iconfont icon-show password-card-icon" @click="showLongPassword(password)"/>
                <span class="iconfont icon-copy password-card-icon" style=""
                      @click="copyText(password.password)"></span>
              </el-text>
              <div class="clear"></div>
            </li>
            <li v-if="password.remark">
              <el-text class="password-field-name">备注:</el-text>
              <el-text class="password-field-value">
                {{ password.remark }}
              </el-text>
              <div class="clear"></div>
            </li>
            <li v-if="password.labels.length">
              <el-text class="password-field-name">标签:</el-text>
              <el-text class="password-field-value">
                <el-tag v-for="label in getPasswordLabelNames(password)" class="card-label">
                  {{ label.name }}
                </el-tag>
              </el-text>
              <div class="clear"></div>
            </li>
            <template v-for="field in password.customFields">
              <li v-if="field.key || field.val">
                <el-text class="password-field-name">{{ field.key }}:</el-text>
                <el-text class="password-field-value">{{ field.val }}</el-text>
                <div class="clear"></div>
              </li>
            </template>
          </ul>
          <template #footer>
            <div style="display: flex;justify-content: space-between">
              <el-text style="font-size: 80%" type="info">{{ formatterDate(password.updateTime, 'YYYY-MM-DD HH:mm') }}
              </el-text>
              <div>
                <el-tooltip content="删除" placement="top">
                  <el-button plain size="small" type="danger" @click="deletePassword(password)">
                    <span class="iconfont icon-delete card-opt-icon"/>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="修改" placement="top">
                  <el-button plain size="small" type="primary"
                             @click="refStore.passwordFormRef.editPasswordForm(password)">
                    <span class="iconfont icon-edit card-opt-icon"/>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="分享" placement="top">
                  <el-button plain size="small" type="success" @click="sharePassword(password)">
                    <span class="iconfont icon-share card-opt-icon"/>
                  </el-button>
                </el-tooltip>
              </div>
            </div>
          </template>
        </el-card>
      </div>
    </div>
    <EmptyList v-else></EmptyList>
  </el-scrollbar>
</template>

<style scoped>
.password-card {
  margin: 6px;
  display: flex;
  flex-direction: column;
  height: calc(100% - 12px);
}

.password-strength {
  border-radius: 50%;
  width: 14px;
  height: 14px;
  float: left;
  margin-right: 10px;
  position: relative;
  top: 6px;
}

.card-opt-icon {
  font-size: 140%;
}

.card-label {
  margin: 0 10px 5px 0;
}

.password-field-ul {
  padding: 0;
  margin: 0;
}

.password-field-ul li {
  list-style: none;
  margin-bottom: 10px;
}

.password-field-ul li:last-child {
  margin-bottom: 0;
}

.password-field-name {
  width: 55px;
  text-align: right;
  float: left;
  font-size: 15px;
  color: #909399;
}

.password-field-value {
  float: left;
  margin-left: 15px;
  font-size: 15px;
  word-break: break-all;
}

.copy-username {
  margin-left: 10px;
}

.card-password-span {
  word-wrap: break-word;
  word-break: normal;
}

.password-card-icon, .copy-username {
  cursor: pointer;
  padding: 5px;
  border-radius: 5px;
  font-size: 16px;
}

.password-card-icon:hover, .copy-username:hover {
  background-color: rgba(200, 200, 200, 0.3);
  color: #409eff;
}

.password-header-div {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
}

.clear {
  clear: both;
}

.password-card-icon.icon-hide {
  font-size: 118%;
  margin-left: 5px
}

.password-card-icon.icon-show {
  font-size: 120%;
  margin-left: 5px
}

.card-opt-icon.icon-delete {
  font-size: 150%;
}

.empty-card {
  display: flex;
  height: 100%;
  justify-content: center;
}

:deep(.password-card .el-card__body), :deep(.password-card .el-card__footer) {
  padding: 14px 16px;
}

:deep(.password-card .el-card__header) {
  padding: 0;
  border-bottom: 0
}
</style>