<!-- 收藏夹卡片组件 -->
<script setup lang="ts">

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";

const passwordStore = usePasswordStore()
const settingStore = useSettingStore()
</script>

<template>
  <el-card
      v-if="settingStore.setting.showFavoriteCard"
      class="favorite-card" :style="{'background-color': passwordStore.isDark?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.4)'}"
  >
    <template #header>
      <div style="display: flex;justify-content: space-between">
        <div>
          <span class="iconfont icon-collect" style="color: #FF9700;margin-right: 8px;font-size: 110%"></span>
          <el-text size="large">收藏</el-text>
        </div>
        <div>
          <el-tooltip v-if="passwordStore.filterCondition.favoriteId !== 0" content="收藏过滤生效中，点击取消" placement="left">
            <el-badge is-dot class="item">
                  <span
                      @click="passwordStore.filterCondition.favoriteId = 0"
                      class="iconfont icon-filtration filter-icon"></span>
            </el-badge>
          </el-tooltip>
        </div>
      </div>
    </template>
    <!-- 收藏夹 -->
    <Favorite></Favorite>
  </el-card>
</template>

<style scoped>
.favorite-card {
  margin: 10px 10px 10px 0;
  backdrop-filter: blur(50px);
}

.filter-icon {
  margin-left: 5px;
  font-size: 115%;
  color: #409eff;
  cursor: pointer;
}
:deep(.el-card__body) {
  padding: 14px 16px;
}
</style>