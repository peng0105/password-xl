<!--标签卡片-->
<script lang="ts" setup>

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

</script>

<template>
  <el-card
      v-if="settingStore.setting.showLabelCard"
      :style="{'background-color': passwordStore.isDark?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.4)'}"
      class="label-card"
      header="标签">
    <template #header>
      <div style="display: flex;justify-content: space-between">
        <div>
          <span class="iconfont icon-label" style="color: #409EFF;margin-right: 8px;font-size: 110%"></span>
          <el-text size="large">标签</el-text>
        </div>
        <div>
          <el-tooltip v-if="passwordStore.filterCondition.labelArray.length" content="标签过滤生效中，点击取消"
                      placement="left">
            <el-badge class="item" is-dot>
                    <span
                        class="iconfont icon-filtration filter-icon"
                        @click="refStore.labelTreeRef.setCheckedNodes([])"></span>
            </el-badge>
          </el-tooltip>
        </div>
      </div>
    </template>
    <!-- 标签树 -->
    <LabelTree :ref="(el: any) => refStore.labelTreeDivRef = el"></LabelTree>
  </el-card>
</template>

<style scoped>
.label-card {
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