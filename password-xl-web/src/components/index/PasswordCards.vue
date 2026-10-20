<!--卡片式密码列表-->
<script lang="ts" setup>
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import { displaySize } from '@/utils/global.ts'
import PasswordCard from './PasswordCard.vue'
import { providePasswordCardReveal } from '@/composables/passwordCardReveal.ts'

const passwordStore = usePasswordStore()
const passwordCardScrollbar = ref()
providePasswordCardReveal()

const getRowCount = (): number => {
  if (['xs'].includes(displaySize().value)) {
    return 1
  } else if (['sm', 'md'].includes(displaySize().value)) {
    return 2
  } else if (['lg'].includes(displaySize().value)) {
    return 3
  } else {
    return 4
  }
}

const pageIndex = ref(1)
const pageSize = ref(getRowCount() * 5)

const getPagePasswordArray = () => {
  return passwordStore.visPasswordArray.slice(0, pageIndex.value * pageSize.value)
}

// 筛选条件变化后从第一页重新展示，避免沿用滚动后的大分页范围。
watch(
  [
    () => passwordStore.filterCondition.searchText,
    () => passwordStore.filterCondition.labelArray.join(','),
    () => passwordStore.filterCondition.favoriteId,
  ],
  () => {
    pageIndex.value = 1
    nextTick(() => {
      const scrollbarWrap = passwordCardScrollbar.value?.wrapRef
      if (scrollbarWrap) {
        scrollbarWrap.scrollTop = 0
      }
    })
  },
)

const scrollLoad = () => {
  const scrollbarWrap = passwordCardScrollbar.value?.wrapRef
  if (!scrollbarWrap) {
    return
  }
  if (scrollbarWrap.scrollTop + scrollbarWrap.clientHeight >= scrollbarWrap.scrollHeight - 200) {
    if (pageIndex.value * pageSize.value < passwordStore.visPasswordArray.length) {
      pageIndex.value++
    }
  }
}

const listenerScroll = () => {
  const scrollbarWrap = passwordCardScrollbar.value?.wrapRef
  scrollbarWrap?.addEventListener('scroll', scrollLoad)
}

onMounted(() => {
  scrollLoad()
  listenerScroll()
})

onBeforeUnmount(() => {
  const scrollbarWrap = passwordCardScrollbar.value?.wrapRef
  scrollbarWrap?.removeEventListener('scroll', scrollLoad)
})
</script>

<template>
  <el-scrollbar ref="passwordCardScrollbar" height="100%">
    <div
      v-if="passwordStore.visPasswordArray.length"
      :style="{ 'grid-template-columns': 'repeat(' + getRowCount() + ', minmax(0, 1fr))' }"
      class="password-card-grid"
    >
      <PasswordCard
        v-for="password in getPagePasswordArray()"
        :key="password.id"
        :password="password"
        :selection-mode="passwordStore.batchOperationEnabled"
        :selected="passwordStore.batchSelectedPasswordIds.includes(password.id)"
        @selected-change="passwordStore.toggleBatchPasswordSelection(password.id, $event)"
      />
    </div>
    <EmptyList v-else />
  </el-scrollbar>
</template>

<style scoped>
.password-card-grid {
  display: grid;
  padding: 6px;
}
</style>
