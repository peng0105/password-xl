<template>
  <div
    v-loading="true"
    class="relation-loading"
    element-loading-text="加载中..."
    aria-busy="true"
  />
</template>

<style scoped>
.relation-loading {
  height: 100%;
  background: var(--el-fill-color-extra-light);
}
</style>
