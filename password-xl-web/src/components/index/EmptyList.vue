<script lang="ts" setup>
import {ServiceStatus} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()

</script>

<template>
  <div class="empty-list-div">
    <div v-if="passwordStore.serviceStatus === ServiceStatus.LOGGED">
      <span class="iconfont icon-lock-close"></span>
      <div class="status-tip">已锁定</div>
      <el-button plain style="margin-top: 30px" type="primary" @click="refStore.verifyPasswordRef.verifyAndUnlock()">
        解锁
      </el-button>
    </div>
    <div v-if="passwordStore.serviceStatus === ServiceStatus.UNLOCKED">
      <img alt="" src="../../assets/images/empty.svg">
      <div class="status-tip">这里一个密码都没有</div>
      <el-button
          v-if="passwordStore.passwordArray.length === 0"
          plain
          style="margin-top: 30px"
          type="primary"
          @click="refStore.passwordFormRef.addPasswordForm()">
        添加我的第一个密码
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.empty-list-div {
  display: flex;
  width: 100%;
  justify-content: center;
  height: 80vh;
  align-items: center;
  text-align: center;
}

.status-tip {
  color: #888;
  margin-top: 30px;
}

.icon-lock-close {
  font-size: 200px;
  color: #dcdfe6;
}

</style>