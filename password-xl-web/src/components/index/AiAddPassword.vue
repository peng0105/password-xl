<script setup lang="ts">
import {displaySize} from "@/utils/global.ts";
import {extractPasswordApi} from "@/api/password-xl-api.ts";
import {useRefStore} from "@/stores/RefStore.ts";

const refStore = useRefStore()

const alertInfo = ref({
  vis: false,
  loading: false,
  text: ''
})

const show = () => {
  alertInfo.value.text = ''
  alertInfo.value.loading = false
  alertInfo.value.vis = true
}

const extractPassword = () => {
  alertInfo.value.loading = true
  extractPasswordApi(alertInfo.value.text).then((resp: any) => {
    refStore.passwordFormRef.addPasswordForm()
    refStore.passwordFormRef.setPasswordForm(JSON.parse(resp))
    alertInfo.value.vis = false
    alertInfo.value.loading = false
    alertInfo.value.text = ''
  }).catch((msg: any) => {
    alertInfo.value.loading = false
    ElNotification.error({title: '系统异常', message: msg})
  })
}

defineExpose({
  show
})
</script>

<template>
  <el-dialog
      title="AI创建密码"
      :width="['xs', 'sm'].includes(displaySize().value)?'95%':'550px'"
      v-model="alertInfo.vis">
    <div v-loading="alertInfo.loading" element-loading-text="正在处理...">
      <el-text type="info">
        你可以直接粘贴包含账号密码信息的字符串，Ai大模型将自动解析您的密码
      </el-text>
      <div style="margin-top: 10px">
        <el-input type="textarea" v-model="alertInfo.text" :rows="6" placeholder="请粘贴账号密码到这里"></el-input>
      </div>
      <el-text type="danger" size="small">
        您的密码信息将在加密后传输至Ai大模型进行处理，密码信息不会以任何形式进行存储
      </el-text>
    </div>
    <template #footer>
      <el-button type="primary" plain
                 :disabled="!alertInfo.text || alertInfo.loading"
                 @click="extractPassword">
        Ai解析
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>

</style>