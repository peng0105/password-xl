<!--标签抽屉-->
<script lang="ts" setup>
import {displaySize} from "@/utils/global.ts";

const labelDialogVis = ref(false)

// 显示标签抽屉
const showLabelDrawer = () => {
  labelDialogVis.value = true
}

defineExpose({
  showLabelDrawer
})
</script>

<template>
  <div>
    <el-drawer
        v-model="labelDialogVis"
        :direction="['xs','sm'].includes(displaySize().value)?'btt':'rtl'"
        :size="['xs','sm'].includes(displaySize().value)?'80%':'350px'" title="标签">
      <div style="font-size: 12px;color: #999;margin-bottom: 20px">
        <span class="iconfont icon-info" style="font-size: 100%"></span>
        选中标签可以对密码列表进行过滤
      </div>
      <!-- 标签树 -->
      <LabelTree></LabelTree>
    </el-drawer>
  </div>
</template>

<style scoped>
:deep(.el-drawer__header) {
  margin-bottom: 0;
}
</style>