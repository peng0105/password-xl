<!--列表式密码组件-->
<script setup lang="ts">
import {Password, Sort} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {
  copyText,
  formatterDate,
  getBgColor,
  getPasswordLabelNames,
  getPasswordStrength,
  getPasswordStrengthColor,
  getPasswordStrengthTip,
  isUrl,
  sharePassword
} from "@/utils/global.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {CSSProperties} from "vue";

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

// 查看密码的id
const showPasswordId = ref(0)
const passwordTableRef = ref()

// 查看密码
const showLongPassword = (password: any) => {
  console.log('table 查看密码：', password.id)
  if (password.password.length > 40) {
    console.log('table 查看密码 长度大于40')
    // 长度大于40使用弹框展示
    refStore.showPasswordRef.showPassword(password)
    showPasswordId.value = 0
  } else {
    showPasswordId.value = password.id
  }
}

// 删除密码
const deletePassword = (password: Password) => {
  console.log('table 删除密码：', password.id)
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
    console.log('table 确认删除：', password.id)
    passwordStore.passwordManager.deletePassword(password.id).then(resp => {
      if (!resp.status) {
        console.log('table 删除密码异常：', resp.message)
        ElNotification.error({title: '系统异常', message: resp.message})
      }
    })
  }).catch(() => {
  })
}

// 收藏密码
const favoritePassword = (password: Password) => {
  if (password.favorite) {
    console.log('取消收藏密码')
    password.favorite = false
  } else {
    console.log('收藏密码')
    password.favorite = true
  }
  password.favoriteTime = Date.now()
  passwordStore.passwordManager.updatePassword(password)
}

// strength 排序
const strengthSort = (a: Password, b: Password) => {

  let aSort = getPasswordStrength(a.password);
  let bSort = getPasswordStrength(b.password);

  // 比较值并返回排序结果
  if (aSort > bSort) {
    return settingStore.setting.sortOrder === Sort.ASC ? 1 : -1;
  } else if (aSort < bSort) {
    return settingStore.setting.sortOrder === Sort.ASC ? -1 : 1;
  } else {
    return 0;
  }
}

const tableRowStyle = (data: { row: any, rowIndex: number }): CSSProperties => {
  if (settingStore.setting.passwordColor && data.row.bgColor) {
    return {'background-color': getBgColor(data.row.bgColor, '0.1')};
  } else {
    return {'background-color': 'rgba(0,0,0,0)'};
  }
}


const pageIndex = ref(1)
const pageSize = ref(Math.ceil(innerHeight / 62) + 5)
const getPagePasswordArray = () => {
  return passwordStore.visPasswordArray.slice(0, pageIndex.value * pageSize.value)
}

const scrollLoad = () => {
  const scrollbarWrap = passwordTableRef.value?.$el.querySelector(".el-scrollbar__wrap");
  if (scrollbarWrap.scrollTop + scrollbarWrap.clientHeight >= scrollbarWrap.scrollHeight - 200) {
    if (pageIndex.value * pageSize.value < passwordStore.visPasswordArray.length) {
      pageIndex.value++
    }
  }
}

const listenerScroll = () => {
  const scrollbarWrap = passwordTableRef.value.$el.querySelector(".el-scrollbar__wrap");
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
  <div class="password-card-table" v-if="passwordStore.visPasswordArray.length">
    <el-table
        :data="getPagePasswordArray()"
        ref="passwordTableRef"
        height="calc(100vh - 120px)"
        style="background-color: rgba(0,0,0,0);"
        :header-row-style="{'background-color':'rgba(0,0,0,0)'}"
        :header-cell-style="{'background-color':'rgba(0,0,0,0)'}"
        :row-style="tableRowStyle"
        :cell-style="{'background-color':'rgba(0,0,0,0)'}"
    >
      <el-table-column v-if="settingStore.setting.showStrength" prop="strength" width="30px" :sort-method="strengthSort"
                       sortable>
        <template #default="scope">
          <el-tooltip :content="getPasswordStrengthTip(scope.row.password)" placement="top">
            <div class="password-strength"
                 :style="{'background-color':getPasswordStrengthColor(scope.row.password)}"></div>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="名称" min-width="130px" sortable prop="title"></el-table-column>
      <el-table-column label="地址" min-width="200px" prop="address">
        <template #default="scope">
          <div>
            <el-link v-if="isUrl(scope.row.address)" type="primary" class="address-link" :href="scope.row.address"
                     target="_blank">
              {{ scope.row.address }}
            </el-link>
            <el-text v-else>
              {{ scope.row.address }}
            </el-text>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="用户名" min-width="180px" sortable prop="username">
        <template #default="scope">
          <div v-if="scope.row.username" class="username-div">
            <div class="username-text">
              {{ scope.row.username }}
            </div>
            <div>
              <span class="iconfont icon-copy password-row-icon copy-username"
                    @click="copyText(scope.row.username)"></span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="密码" width="220px" prop="password">
        <template #default="scope">
          <div v-if="scope.row.password" class="table-password-div">
            <div style="width: 150px">
              <span v-if="showPasswordId === scope.row.id" class="table-password-span">{{ scope.row.password }}</span>
              <span v-if="showPasswordId !== scope.row.id" class="table-password-symbol">*******</span>
            </div>
            <div>
              <span v-if="showPasswordId === scope.row.id" class="iconfont icon-hide password-row-icon"
                    @click="showPasswordId = 0"/>
              <span v-if="showPasswordId !== scope.row.id" class="iconfont icon-show password-row-icon"
                    @click="showLongPassword(scope.row)"/>
              <span class="iconfont icon-copy password-row-icon" @click="copyText(scope.row.password)"></span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="添加时间" min-width="150px" sortable
                       :formatter="(row: any) => formatterDate(row.addTime,'YYYY-MM-DD HH:mm')"
                       v-if="settingStore.setting.showTimeForTable === 'addTime'" prop="addTime"></el-table-column>
      <el-table-column label="修改时间" min-width="150px" sortable
                       :formatter="(row: any) => formatterDate(row.updateTime,'YYYY-MM-DD HH:mm')"
                       v-if="settingStore.setting.showTimeForTable === 'updateTime'"
                       prop="updateTime"></el-table-column>
      <el-table-column label="标签" min-width="110px" v-if="settingStore.setting.showLabelForTable" prop="labels">
        <template #default="scope">
          <el-tag v-for="label in getPasswordLabelNames(scope.row)" class="table-label">
            {{ label.name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="130px" prop="remark"></el-table-column>
      <el-table-column label="操作" min-width="145px" width="150px">
        <template #default="scope">
          <div style="display: flex;justify-content: space-evenly;">
            <el-tooltip content="分享" placement="top">
              <el-link type="success" @click="sharePassword(scope.row)" :underline="false">
                <span class="iconfont icon-share table-opt-icon"/>
              </el-link>
            </el-tooltip>
            <el-tooltip content="修改" placement="top">
              <el-link type="primary" @click="refStore.passwordFormRef.editPasswordForm(scope.row)" :underline="false">
                <span class="iconfont icon-edit table-opt-icon"/>
              </el-link>
            </el-tooltip>
            <el-tooltip :content="scope.row.favorite?'取消收藏':'收藏'" placement="top">
              <el-link v-if="scope.row.favorite" type="primary" @click="favoritePassword(scope.row)" :underline="false">
                <span class="iconfont icon-favorited table-opt-icon" style="color: #FF9700"/>
              </el-link>
              <el-link v-if="!scope.row.favorite" type="primary" @click="favoritePassword(scope.row)"
                       :underline="false">
                <span class="iconfont icon-collect table-opt-icon" style="color: #FF9700"/>
              </el-link>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-link type="danger" @click="deletePassword(scope.row)" :underline="false">
                <span class="iconfont icon-delete table-opt-icon"/>
              </el-link>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
  <EmptyList v-else></EmptyList>
</template>

<style scoped>
.password-card-table {
  padding: 13px;
}

.password-row-icon {
  margin-left: 3px;
  cursor: pointer;
  padding: 5px;
  border-radius: 5px;
  font-size: 16px;
  line-height: 34px;
  height: 34px;
}

.password-row-icon:hover {
  background-color: rgba(200, 200, 200, 0.3);
  color: #409eff;
}

.icon-hide, .icon-show {
  font-size: 20px;
  position: relative;
  top: 2px;
}

.password-strength {
  border-radius: 50%;
  width: 13px;
  height: 13px;
}

.copy-username {
  margin-left: 10px
}

.username-div, .table-password-div {
  display: flex;
  justify-content: space-between;
}

.username-text {
  width: 130px
}

.table-password-span {
  line-height: 36px;
  word-wrap: break-word;
  word-break: normal;
}

.table-password-symbol {
  line-height: 36px;
}

.table-opt-icon {
  font-size: 130%;
}

.table-label {
  margin: 3px;
  cursor: default;
}

.address-link {
  max-width: 100%;
}

:deep(.address-link .el-link__inner) {
  min-width: 0;
  display: block;
}
</style>