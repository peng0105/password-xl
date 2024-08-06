<!--快捷键-->
<script setup lang="ts">
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {PasswordDisplayMode, ServiceStatus, TopicMode} from "@/types";

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

// 快捷键
const handleKeyDown = (event: KeyboardEvent) => {
  if (!settingStore.setting.enableShortcutKey) {
    return
  }
  if (event.ctrlKey && event.key.toUpperCase() === 'F') {
    console.log('使用快捷键 Ctrl + F')
    // 阻止浏览器默认功能
    event.preventDefault();
    refStore.searchInputRef?.focus()
  } else if (event.altKey && event.key.toUpperCase() === 'N') {
    console.log('使用快捷键 Alt + N')
    // 阻止浏览器默认功能
    event.preventDefault();
    refStore.passwordFormRef.addPasswordForm()
  } else if (event.altKey && event.key.toUpperCase() === 'L') {
    console.log('使用快捷键 Alt + L')
    // 阻止浏览器默认功能
    event.preventDefault();
    if (passwordStore.serviceStatus === ServiceStatus.LOGGED) {
      refStore.verifyPasswordRef.verifyAndUnlock()
    } else {
      passwordStore.passwordManager.lock();
    }
  } else if (event.altKey && event.key.toUpperCase() === 'V') {
    console.log('使用快捷键 Alt + V')
    // 阻止浏览器默认功能
    event.preventDefault();
    if (settingStore.setting.passwordDisplayMode === PasswordDisplayMode.CARD) {
      switchDisplayMode(PasswordDisplayMode.TABLE)
    } else {
      switchDisplayMode(PasswordDisplayMode.CARD)
    }
  } else if (event.altKey && event.key.toUpperCase() === 'T') {
    console.log('使用快捷键 Alt + T')
    // 阻止浏览器默认功能
    event.preventDefault();
    if (passwordStore.isDark) {
      switchTopicMode(TopicMode.LIGHT)
    } else {
      switchTopicMode(TopicMode.DARK)
    }
  }
};

// 切换密码展示方式
const switchDisplayMode = (displayMode: PasswordDisplayMode) => {
  settingStore.setting.passwordDisplayMode = displayMode
  passwordStore.passwordManager.syncSetting()
}

// 切换主题
const switchTopicMode = (topicMode: TopicMode) => {
  passwordStore.setTopicMode(topicMode)
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown);
});

</script>

<template>

</template>

<style scoped>

</style>