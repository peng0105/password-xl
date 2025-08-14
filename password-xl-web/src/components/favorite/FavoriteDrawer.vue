<!-- 收藏夹抽屉组件 -->
<script lang="ts" setup>
import {displaySize} from "@/utils/global.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";

const passwordStore = usePasswordStore()

const favoriteDialogVis = ref(false)

// 显示收藏抽屉
const showFavoriteDrawer = () => {
  favoriteDialogVis.value = true
}

defineExpose({
  showFavoriteDrawer
})

// 监听收藏筛选变更
watch(() => passwordStore.filterCondition.favoriteId, () => {
  favoriteDialogVis.value = false
})
</script>

<template>
  <div>
    <el-drawer
        v-model="favoriteDialogVis"
        :direction="['xs','sm'].includes(displaySize().value)?'btt':'rtl'"
        :size="['xs','sm'].includes(displaySize().value)?'60%':'350px'" title="收藏">
      <div v-if="passwordStore.favoritePasswordArray.length" style="font-size: 12px;color: #999;margin-bottom: 20px">
        <span class="iconfont icon-info" style="font-size: 100%"></span>
        点击收藏内容即可查看密码
      </div>
      <!-- 收藏列表 -->
      <Favorite></Favorite>
    </el-drawer>
  </div>
</template>

<style scoped>
:deep(.el-drawer__header) {
  margin-bottom: 0;
}
</style>