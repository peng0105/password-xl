<!--密码管理首页-->
<script setup lang="ts">
import {PasswordDisplayMode, ServiceStatus} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {displaySize} from "@/utils/global.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import Contextmenu from "@/components/index/Contextmenu.vue";

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

onMounted(() => {
  if (passwordStore.serviceStatus === ServiceStatus.LOGGED) {
    console.log('页面加载完成，验证并解锁')
    refStore.verifyPasswordRef.verifyAndUnlock()
    if (!settingStore.setting.autoUnlock) {
      // 若未开启自动记住主密码，则删除主密码（解决多账号切换问题）
      localStorage.removeItem('mainPassword')
    }
  } else if (passwordStore.serviceStatus === ServiceStatus.WAIT_INIT) {
    console.log('页面加载完成，初始化主密码')
    refStore.setPasswordRef.setMainPassword()
  }
})

// 手机端优先使用卡片展示密码
if (['xs', 'sm'].includes(displaySize().value) && settingStore.setting.passwordDisplayMode === PasswordDisplayMode.TABLE) {
  settingStore.setting.passwordDisplayMode = PasswordDisplayMode.CARD
}


</script>

<template>
  <!-- 电脑版 -->
  <div
      v-if="!['xs','sm'].includes(displaySize().value)"
      @click="refStore.contextmenuRef.hideContextmenu()"
      @contextmenu.prevent="refStore.contextmenuRef.showContextmenu($event)">
    <el-row class="password-body-row">
      <el-col
          :md="{span: (!settingStore.setting.showLabelCard && !settingStore.setting.showFavoriteCard)?24:18}"
          :lg="{span: (!settingStore.setting.showLabelCard && !settingStore.setting.showFavoriteCard)?24:20}"
          :xl="{span: (!settingStore.setting.showLabelCard && !settingStore.setting.showFavoriteCard)?24:21}"

      >
        <el-card
            class="password-card"
            body-class="password-card-body"
            :style="{'background-color': passwordStore.isDark?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.4)'}"
        >
          <!-- 密码表头 -->
          <PasswordHeader></PasswordHeader>
          <!-- 正在过滤密码提示语 -->
          <FilteringTip></FilteringTip>
          <!-- 密码表 -->
          <PasswordTable v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.TABLE"></PasswordTable>
          <!-- 密码卡片 -->
          <PasswordCards v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.CARD"></PasswordCards>
        </el-card>
      </el-col>
      <el-col
          :md="{span: 6}"
          :lg="{span:4}"
          :xl="{span:3}"
          v-if="settingStore.setting.showLabelCard || settingStore.setting.showFavoriteCard">
        <!-- 标签卡片 -->
        <LabelCard></LabelCard>
        <!-- 收藏卡片 -->
        <FavoriteCard></FavoriteCard>
      </el-col>
    </el-row>
  </div>

  <!-- 手机版 -->
  <div v-else style="backdrop-filter: blur(50px);height: 100vh"
       :style="{'background-color': passwordStore.isDark?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.4)'}">
    <!-- 密码表头 -->
    <PasswordHeader></PasswordHeader>
    <!-- 正在过滤密码提示语 -->
    <FilteringTip></FilteringTip>
    <!-- 密码表 -->
    <PasswordTable v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.TABLE"></PasswordTable>
    <!-- 密码卡片 -->
    <PasswordCards v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.CARD"></PasswordCards>
  </div>

  <!-- 注销账号 -->
  <CancelAccount :ref="(el: any) => refStore.cancelAccountRef = el"></CancelAccount>
  <!-- 密码表单 -->
  <PasswordForm :ref="(el: any) => refStore.passwordFormRef = el"></PasswordForm>
  <!-- 标签抽屉 -->
  <LabelDrawer :ref="(el: any) => refStore.labelDrawer = el"></LabelDrawer>
  <!-- 收藏抽屉 -->
  <FavoriteDrawer :ref="(el: any) => refStore.favoriteDrawer = el"></FavoriteDrawer>
  <!-- 密码回收站 -->
  <RecycleBin :ref="(el: any) => refStore.recycleBinRef = el"></RecycleBin>
  <!-- 备份与恢复 -->
  <BackupAndRecovery :ref="(el: any) => refStore.backupAndRecoveryRef = el"></BackupAndRecovery>
  <!-- 设置主密码 -->
  <SetPassword :ref="(el:any) => refStore.setPasswordRef = el"></SetPassword>
  <!-- 设置组件 -->
  <Setting :ref="(el: any) => refStore.settingRef = el"></Setting>
  <!-- 新手引导 -->
  <NoviceGuide :ref="(el: any) => refStore.tourRef = el"></NoviceGuide>
  <!-- 查看密码 -->
  <ShowPassword :ref="(el: any) => refStore.showPasswordRef = el"></ShowPassword>
  <!-- 导出密码 -->
  <ExportExcel :ref="(el: any) => refStore.exportExcelRef = el"></ExportExcel>
  <!-- 导入密码 -->
  <ImportExcel :ref="(el: any) => refStore.importExcelRef = el"></ImportExcel>
  <!-- 右键菜单 -->
  <Contextmenu :ref="(el: any) => refStore.contextmenuRef = el"></Contextmenu>
  <!-- 快捷键 -->
  <ShortcutKey></ShortcutKey>
</template>

<style>
.password-card-body {
  padding: 0;
}

</style>
<style scoped>
.password-body-row {
  margin-top: 0
}

.password-card {
  margin: 10px;
  height: calc(100vh - 24px);
  backdrop-filter: blur(50px);
}

</style>