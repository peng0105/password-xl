<!-- 密码回收站 -->
<script setup lang="ts">

import {displaySize} from "@/utils/global.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {Password} from "@/types";

const passwordStore = usePasswordStore()
const settingStore = useSettingStore()

// 是否显示回收站组件
const visRecycleBin = ref(false);

// 打开回收站
const openRecycleBin = () => {
  console.log('打开回收站')
  visRecycleBin.value = true;
}

// 启用回收站功能
const enableRecycleBin = () => {
  console.log('启用回收站功能')
  settingStore.setting.enableRecycleBin = true
  passwordStore.passwordManager.syncSetting().then(resp => {
    if (resp && resp.status) {
      ElMessage.success('已开启密码回收站')
    }
  })
}

// 彻底删除密码
const completelyDelete = (password: Password) => {
  console.log('彻底删除密码：', password.id)
  passwordStore.passwordManager.completelyDeletePassword(password.id).then(resp => {
    if (resp.status) {
      ElMessage.success('删除成功')
    }
  })
}

// 还原密码
const cancelDeletePassword = (password: Password) => {
  console.log('还原密码：', password.id)
  passwordStore.passwordManager.cancelDeletePassword(password.id)
}

defineExpose({
  openRecycleBin
})
</script>

<template>
  <el-dialog
      :fullscreen="['xs'].includes(displaySize().value)"
      v-model="visRecycleBin"
      width="600px"
      draggable
      class="recycle-bin">
    <template #header>
      <el-text size="large" style="user-select: none;">
        <span class="iconfont icon-recycle-bin"></span>
        回收站
      </el-text>
    </template>
    <el-table height="380px" :header-cell-style="{'padding':0}" v-if="settingStore.setting.enableRecycleBin" :data="passwordStore.deletedArray">
      <template #empty>
        <el-text type="info">这里空空如也</el-text>
      </template>
      <el-table-column prop="title"></el-table-column>
      <el-table-column width="150px">
        <template #default="scope">
          <el-link type="primary" @click="cancelDeletePassword(scope.row)" :underline="false">还原</el-link>
          <el-link type="danger" style="margin-left: 15px" @click="completelyDelete(scope.row)" :underline="false">彻底删除</el-link>
        </template>
      </el-table-column>
    </el-table>
    <div v-else style="text-align: center;">
      <div style="margin-top: 20px;">
        <span class="iconfont icon-recycle-bin not-enabled-recycle-bin-icon"></span>
      </div>
      <div style="margin: 20px">
        <el-text type="info">当前未开启密码回收站功能</el-text>
      </div>
      <div style="margin: 40px">
        <el-button @click="enableRecycleBin" type="primary" plain>开启回收站</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.icon-recycle-bin {
  font-size: 110%;
  color: #E6A23C;
  margin-right: 5px;
}

.not-enabled-recycle-bin-icon {
  font-size: 130px;
  color: #ccc;
}

.recycle-bin {
  min-height: 400px
}

</style>