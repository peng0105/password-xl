<!-- 密码列表隐私模式占位 -->
<script lang="ts" setup>
import {usePasswordStore} from "@/stores/PasswordStore.ts";

const passwordStore = usePasswordStore()
</script>

<template>
  <div class="privacy-mode">
    <div class="privacy-mode-content">
      <img alt="隐私模式" class="privacy-mode-image" src="../../assets/images/privacy.svg">
      <el-text class="privacy-mode-title" size="large" tag="div">密码列表已隐藏</el-text>
      <el-text class="privacy-mode-description" tag="p" type="info">
        搜索、选择标签或收藏，可以只显示匹配的密码
      </el-text>
      <el-button class="privacy-mode-button" plain type="primary" @click="passwordStore.showAllPasswords()">
        <span class="iconfont icon-show privacy-mode-button-icon"></span>
        显示全部密码
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.privacy-mode {
  align-items: center;
  display: flex;
  height: calc(100vh - 84px);
  justify-content: center;
  text-align: center;
  width: 100%;
}

.privacy-mode-content {
  margin-top: -30px;
}

.privacy-mode-image {
  display: block;
  height: 220px;
  margin: 0 auto;
  width: 320px;
}

.privacy-mode-title {
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 600;
  margin-top: 20px;
}

.privacy-mode-description {
  margin: 10px 20px 0;
}

.privacy-mode-button {
  margin-top: 24px;
}

.privacy-mode-button-icon {
  font-size: 16px;
  margin-right: 6px;
}

@media (max-width: 767px) {
  .privacy-mode {
    height: calc(100vh - 60px);
  }

  .privacy-mode-content {
    margin-top: -20px;
  }

  .privacy-mode-image {
    height: auto;
    width: 240px;
  }

  .privacy-mode-description {
    line-height: 1.6;
    max-width: 280px;
  }
}
</style>
