<!--登录类型选择组件-->
<script lang="ts" setup>
import ElectronLoginForm from "@/components/login/ElectronLoginForm.vue";
import AndroidLoginForm from "@/components/login/AndroidLoginForm.vue";

const electronLoginFormRef = ref()
const androidLoginFormRef = ref()
const emits = defineEmits(['loginTypeChange'])

const isElectron = () => {
  return window.electronAPI && window.electronAPI.setTopic
}
const isAndroid = () => {
  return window.androidAPI && window.androidAPI.setTopic
}

const electronStore = () => {
  console.log('使用本地存储electron')
  emits('loginTypeChange', 'electron')
  electronLoginFormRef.value.useLocalLogin()
}

const androidStore = () => {
  console.log('使用本地存储android')
  emits('loginTypeChange', 'android')
  androidLoginFormRef.value.useLocalLogin()
}

</script>

<template>
  <div>
    <el-row class="login-type-row">
      <el-col :span="12">
        <div class="login-type-item oss" @click="emits('loginTypeChange','oss')">
          <img alt="" src="../../assets/images/login/oss.png">
          <div>
            <el-text>阿里云OSS</el-text>
          </div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="login-type-item cos" @click="emits('loginTypeChange','cos')">
          <img alt="" src="../../assets/images/login/cos.png">
          <div>
            <el-text>腾讯云COS</el-text>
          </div>
        </div>
      </el-col>
      <el-col v-if="false" :span="12">
        <div class="login-type-item official" @click="emits('loginTypeChange','official')">
          <img alt="" src="../../assets/images/login/official.png">
          <div>
            <el-text>官方存储</el-text>
          </div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="login-type-item private" @click="emits('loginTypeChange','private')">
          <img alt="" src="../../assets/images/login/private.png">
          <div>
            <el-text>私有服务</el-text>
          </div>
        </div>
      </el-col>
      <el-col v-if="isElectron()" :span="12">
        <div class="login-type-item local" @click="electronStore">
          <img alt="" src="../../assets/images/login/local.png">
          <div>
            <el-text>本地存储</el-text>
          </div>
        </div>
      </el-col>
      <el-col v-else-if="isAndroid()" :span="12">
        <div class="login-type-item local" @click="androidStore">
          <img alt="" src="../../assets/images/login/local.png">
          <div>
            <el-text>本地存储</el-text>
          </div>
        </div>
      </el-col>
      <el-col v-else :span="12">
        <div class="login-type-item local" @click="emits('loginTypeChange','local')">
          <img alt="" src="../../assets/images/login/local.png">
          <div>
            <el-text>本地存储</el-text>
          </div>
        </div>
      </el-col>
    </el-row>
    <ElectronLoginForm ref="electronLoginFormRef"></ElectronLoginForm>
    <AndroidLoginForm ref="androidLoginFormRef"></AndroidLoginForm>
  </div>
</template>

<style scoped>
.login-type-row {
  text-align: center;
  padding: 10px;
}

.login-type-item {
  border-radius: 8px;
  margin: 10px;
  padding: 15px;
  color: #444;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 3px solid rgba(0, 0, 0, 0);
}

.login-type-item:hover {
  transform: scale(104%);
}

.login-type-item > img {
  width: 45px;
  height: 35px;
  position: relative;
  top: 3px;
}

.login-type-item > div {
  margin-top: 10px;
}

.login-type-item.oss {
  background: rgba(255, 114, 0, 0.25);
}

.login-type-item.oss:hover {
  background: rgba(255, 114, 0, 0.35);
  box-shadow: 0 0 10px #bbb;
}

.login-type-item.cos {
  background: rgba(0, 171, 255, 0.25);
}

.login-type-item.cos:hover {
  background: rgba(0, 171, 255, 0.35);
  box-shadow: 0 0 10px #bbb;
}

.login-type-item.official {
  background: rgba(0, 255, 57, 0.25);
}

.login-type-item.official:hover {
  background: rgba(0, 255, 57, 0.35);
  box-shadow: 0 0 10px #bbb;
}

.login-type-item.private {
  background: rgba(228, 10, 244, 0.2);
}

.login-type-item.private:hover {
  background: rgba(228, 10, 244, 0.27);
  box-shadow: 0 0 10px #bbb;
}

.login-type-item.local {
  background: rgba(40, 193, 39, 0.3);
}

.login-type-item.local:hover {
  background: rgba(40, 193, 39, 0.4);
  box-shadow: 0 0 10px #bbb;
}

</style>