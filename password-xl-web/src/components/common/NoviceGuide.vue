<!--新手引导-->
<script lang="ts" setup>

import {PasswordDisplayMode} from "@/types";
import {useRefStore} from "@/stores/RefStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";

const refStore = useRefStore()
const settingStore = useSettingStore()

// 1、引导创建密码
const tour1 = ref(false)
// 2、引导操作表单
const tour2 = ref(false)
// 3、引导切换视图
const tour3 = ref(false)

// 开始新手引导组件入口
const startTour = () => {
  console.log('进入新手引导')
  tour1.value = true
}

// 添加密码
const addPassword = () => {
  console.log('新手引导，添加密码')
  // 调起密码表单
  refStore.passwordFormRef.addPasswordForm('示例密码')
  setTimeout(() => {
    // 启动引导
    tour2.value = true
    // 清除表单校验结果
    refStore.passwordFormFormRef.clearValidate()
    setTimeout(() => {
      // 输入框获得焦点
      refStore.passwordFormTitleRef.focus()
    }, 100)
  }, 350)
}

// 保存密码
const savePassword = () => {
  console.log('新手引导，保存密码')
  refStore.passwordFormRef.closePasswordForm()
  setTimeout(() => {
    tour3.value = true
  }, 350)
}

defineExpose({
  startTour
})
</script>

<template>
  <el-tour v-model="tour1">
    <el-tour-step :next-button-props="{onClick:addPassword,children:'下一步'}"
                  :target="refStore.createPasswordBtnRef?.$el" title="欢迎使用 password-XL">
      <el-text>您可以点击这里创建密码</el-text>
    </el-tour-step>
    <template #indicators></template>
  </el-tour>

  <el-tour v-model="tour2" :target-area-clickable="false" :z-index="9000">
    <el-tour-step :next-button-props="{children:'下一步'}" :target="refStore.passwordFormTitleRef?.$el"
                  title="密码名称">
      <el-text>在这里输入密码名称</el-text>
    </el-tour-step>
    <el-tour-step :next-button-props="{children:'下一步'}" :target="refStore.passwordFormGenerateBtnRef?.$el"
                  title="随机密码">
      <el-text>点击这里可以随机生成密码，当然您也可以在输入框直接粘贴您已有的密码</el-text>
    </el-tour-step>
    <el-tour-step :next-button-props="{children:'下一步'}" :target="refStore.passwordFormGenerateRuleRef?.$el"
                  title="控制生成规则">
      <el-text>拖动这里控制随机密码的长度</el-text>
    </el-tour-step>
    <el-tour-step :next-button-props="{children:'好的',onClick:savePassword}"
                  :target="refStore.passwordFormSaveBtnRef?.$el" title="保存">
      <el-text>最后，点击这里即可保存密码</el-text>
    </el-tour-step>
    <template #indicators="{ current, total }">
      <el-text>{{ current + 1 }} / {{ total }}</el-text>
    </template>
  </el-tour>

  <el-tour v-model="tour3" :z-index="9000">
    <el-tour-step v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.TABLE"
                  :next-button-props="{children:'好的'}" :target="refStore.displayModeCardRef?.$el" title="密码视图">
      <el-text>点击这里可以切换卡片视图</el-text>
    </el-tour-step>
    <el-tour-step v-if="settingStore.setting.passwordDisplayMode === PasswordDisplayMode.CARD"
                  :next-button-props="{children:'好的'}" :target="refStore.displayModeTableRef?.$el" title="密码视图">
      <el-text>点击这里可以切换表格视图</el-text>
    </el-tour-step>
    <template #indicators></template>
  </el-tour>
</template>

<style scoped>

</style>