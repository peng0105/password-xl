<!-- 正在过滤密码提示语 -->
<script setup lang="ts">

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {displaySize} from "@/utils/global.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

// 是否显示收藏筛选提示
const showFavoriteFilterTip = () => {
  if (!passwordStore.filterCondition.favoriteId) {
    return false;
  }
  return !settingStore.setting.showFavoriteCard || ['xs', 'sm'].includes(displaySize().value)
}

// 是否显示标签筛选提示
const showLabelFilterTip = () => {
  if (passwordStore.filterCondition.labelArray.length === 0) {
    return false;
  }
  return !settingStore.setting.showLabelCard || ['xs', 'sm'].includes(displaySize().value)
}

</script>

<template>
  <div v-if="showFavoriteFilterTip()"
       :style="{'background-color': passwordStore.isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}"
  >
    <el-alert
        show-icon
        center
        type="warning"
        title="现在显示的是根据收藏筛选后的密码"
        close-text="取消筛选"
        @close="passwordStore.filterCondition.favoriteId = 0"/>
  </div>

  <div v-if="showLabelFilterTip()"
       :style="{'background-color': passwordStore.isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}">
    <el-alert
        show-icon
        center
        type="warning"
        title="现在显示的是根据标签筛选后的密码"
        close-text="取消筛选"
        @close="refStore.labelTreeRef.setCheckedNodes([])"/>
  </div>
</template>

<style scoped>

</style>