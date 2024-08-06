<!--关于项目-->
<script setup lang="ts">
import packageJson from '../../../../package.json'
</script>

<template>
  <div>
    <h2 style="margin-top: 0">关于项目</h2>
  </div>
  <div style="padding: 10px;">
    <el-descriptions :column="1">
      <el-descriptions-item label="项目名称：">{{ packageJson.name}}</el-descriptions-item>
      <el-descriptions-item label="当前版本：">{{ packageJson.version }}</el-descriptions-item>
      <el-descriptions-item label="官方网站：">
        <el-link type="primary" target="_blank" :href="packageJson.homepage">{{ packageJson.homepage }}</el-link>
      </el-descriptions-item>
      <el-descriptions-item label="开源地址：">
        <el-link type="primary" target="_blank" :href="packageJson.repository.url">{{ packageJson.repository.url }}</el-link>
      </el-descriptions-item>
      <el-descriptions-item label="作者名称：">{{ packageJson.contributors[0].name }}</el-descriptions-item>
      <el-descriptions-item label="作者邮箱：">{{ packageJson.contributors[0].email }}</el-descriptions-item>
      <el-descriptions-item label="作者微信：">{{ packageJson.contributors[0].weChat }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style>

</style>