<script setup lang="ts">
import {PasswordDisplayMode, ServiceStatus} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

const contextmenu = ref({
  show: false,
  x: 0,
  y: 0
})

// 显示右键菜单
const showContextmenu = (event: MouseEvent) => {
  console.log('显示右键菜单')
  event.preventDefault()
  contextmenu.value.x = event.clientX
  contextmenu.value.y = event.clientY
  contextmenu.value.show = true
}

// 取消右键菜单显示
const hideContextmenu = () => {
  contextmenu.value.show = false
}

// 切换密码展示方式
const switchDisplayMode = (displayMode: PasswordDisplayMode) => {
  console.log('右键菜单，切换密码展示方式')
  settingStore.setting.passwordDisplayMode = displayMode
  passwordStore.passwordManager.syncSetting()
  contextmenu.value.show = false
}

// 创建密码
const createPassword = () => {
  console.log('右键菜单，创建密码')
  if (passwordStore.serviceStatus === ServiceStatus.UNLOCKED) {
    refStore.passwordFormRef.addPasswordForm()
    contextmenu.value.show = false
    return
  }
  console.log('右键菜单，创建密码 需要解锁')
  refStore.verifyPasswordRef.verifyAndUnlock().then(() => {
    refStore.passwordFormRef.addPasswordForm()
    contextmenu.value.show = false
  })
}

// 打开回收站
const openRecycleBin = () => {
  console.log('右键菜单，打开回收站')
  if (passwordStore.serviceStatus === ServiceStatus.UNLOCKED) {
    refStore.recycleBinRef.openRecycleBin();
    contextmenu.value.show = false
    return
  }
  console.log('右键菜单，打开回收站 需要解锁')
  refStore.verifyPasswordRef.verifyAndUnlock().then(() => {
    refStore.recycleBinRef.openRecycleBin();
    contextmenu.value.show = false
  })
}

// 添加标签
const createLabel = () => {
  console.log('右键菜单，添加标签')
  if (passwordStore.serviceStatus === ServiceStatus.UNLOCKED) {
    refStore.labelTreeDivRef.addLabel(null,'sub')
    contextmenu.value.show = false
    return
  }
  console.log('右键菜单，添加标签 需要解锁')
  refStore.verifyPasswordRef.verifyAndUnlock().then(() => {
    refStore.labelTreeDivRef.addLabel(null,'sub')
    contextmenu.value.show = false
  })
}

defineExpose({
  showContextmenu,
  hideContextmenu
})
</script>

<template>
  <div v-if="contextmenu.show"
       class="contextmenu-div"
       :style="{top: contextmenu.y + 'px', left: contextmenu.x + 'px'}">
    <el-card>
      <ul id="contextmenu-ul">
        <li @click="createPassword">
          <span class="iconfont icon-create" style="color: #409EFF"></span>
          创建密码
        </li>
        <li v-if="passwordStore.serviceStatus === ServiceStatus.LOGGED" @click="refStore.verifyPasswordRef.verifyAndUnlock()">
          <span class="iconfont icon-lock" style="color: #E6A23C"></span>
          解锁
        </li>
        <li v-if="passwordStore.serviceStatus === ServiceStatus.UNLOCKED" @click="passwordStore.passwordManager.lock()">
          <span class="iconfont icon-unlock" style="color: #E6A23C"></span>
          锁定
        </li>
        <li v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.CARD" @click="switchDisplayMode(PasswordDisplayMode.TABLE)">
          <span class="iconfont icon-list" style="color: #67C23A"></span>
          表格视图
        </li>
        <li v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.TABLE" @click="switchDisplayMode(PasswordDisplayMode.CARD)">
          <span class="iconfont icon-card" style="color: #67C23A"></span>
          卡片视图
        </li>
        <li @click="createLabel">
          <span class="iconfont icon-label" style="color: #409EFF"></span>
          添加标签
        </li>
        <li @click="openRecycleBin">
          <span class="iconfont icon-recycle-bin" style="color: #F56C6C"></span>
          回收站
        </li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.contextmenu-div {
  position: absolute;
  z-index: 999;
  width: 150px;
}


#contextmenu-ul {
  padding: 0;
  margin: 0;
}

#contextmenu-ul li {
  list-style: none;
  padding: 10px 15px;
  cursor: pointer;
  color: #606266;
  font-size: 14px;
  margin: 0;
}

#contextmenu-ul li .iconfont {
  margin-right: 6px;
}

#contextmenu-ul li:hover {
  background-color: rgb(236, 245, 255);
  color: #409EFF;
}

:deep(.el-card__body) {
  padding: 0 !important;
}

</style>