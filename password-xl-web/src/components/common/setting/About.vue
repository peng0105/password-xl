<!--关于项目-->
<script lang="ts" setup>
import packageJson from '../../../../package.json'

const newFunctions = ref([
  'AI批量导入密码',
  '支持快捷键 ‘/’ 聚焦搜索',
  '支持双击卡片编辑密码',
  '支持自定义密码信息',
  '导出、导入Excel',
  '支持Windows、Android 客户端',
])
</script>

<template>
  <div>
    <h2 style="margin-top: 0">关于项目</h2>
  </div>
  <div style="padding: 10px;">
    <el-descriptions :column="1">
      <el-descriptions-item label="项目名称:">{{ packageJson.name }}</el-descriptions-item>
      <el-descriptions-item label="当前版本:">{{ packageJson.version }}</el-descriptions-item>
      <el-descriptions-item label="官方网站:">
        <el-link :href="packageJson.homepage" target="_blank" type="primary">{{ packageJson.homepage }}</el-link>
      </el-descriptions-item>
      <el-descriptions-item label="开源地址:">
        <el-link :href="packageJson.repository.url" target="_blank" type="primary">{{
            packageJson.repository.url
          }}
        </el-link>
      </el-descriptions-item>
      <el-descriptions-item label="作者邮箱:">{{ packageJson.contributors[0].email }}</el-descriptions-item>
      <el-descriptions-item label="作者微信:">{{ packageJson.contributors[0].weChat }}</el-descriptions-item>
    </el-descriptions>
  </div>
  <div>
    <h2 style="margin-top: 0">最近更新</h2>
  </div>
  <div>
    <ol style="padding-left: 25px;line-height: 26px">
      <li v-for="item in newFunctions">{{ item }}</li>
    </ol>
  </div>
</template>

<style>

</style>