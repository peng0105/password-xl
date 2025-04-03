<!-- 收藏夹组件 -->
<script setup lang="ts">
import {Password} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()

// 当前鼠标悬停的tag
const mouseoverId = ref(0)

// 取消收藏
const cancelFavorite = (password: Password) => {
  console.log('取消收藏：', password.id)
  password.favorite = false
  mouseoverId.value = 0
  passwordStore.filterCondition.favoriteId = 0
  passwordStore.passwordManager.updatePassword(password)
}

// 过滤密码
const filterPassword = (id: number) => {
  console.log('收藏夹过滤密码：', id, passwordStore.filterCondition.favoriteId)
  if (passwordStore.filterCondition.favoriteId === id) {
    passwordStore.filterCondition.favoriteId = 0
  } else {
    passwordStore.filterCondition.favoriteId = id
    console.log('收藏夹密码过滤，清除标签密码过滤：', passwordStore.filterCondition.favoriteId)
    if (refStore.labelTreeRef) {
      refStore.labelTreeRef.setCheckedNodes([]);
    }else{
      passwordStore.filterCondition.labelArray = []
    }
  }
}

// 收藏tag的颜色
const tagEffect = (password: Password) => {
  if (passwordStore.filterCondition.favoriteId === password.id) {
    return 'dark'
  }
  if (mouseoverId.value === password.id) {
    return 'light';
  }
  return 'plain'
};

</script>

<template>
  <el-scrollbar height="calc(50vh - 105px)">
    <div v-if="!passwordStore.favoritePasswordArray.length" class="empty-favorite">
      暂无收藏
    </div>
    <div v-if="passwordStore.favoritePasswordArray.length">
      <el-dropdown trigger="contextmenu" v-for="password in passwordStore.favoritePasswordArray">
        <el-tag
            :effect="tagEffect(password)"
            type="warning"
            @mouseenter="mouseoverId = password.id"
            @mouseleave="mouseoverId = 0"
            class="favorite-tag"
            size="large"
            @click="filterPassword(password.id)">
          {{ password.title }}
        </el-tag>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="cancelFavorite(password)">
              <span class="iconfont icon-edit cancel-favorite"></span>
              取消收藏
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </el-scrollbar>
</template>

<style scoped>
.favorite-tag {
  margin: 5px;
  cursor: pointer;
  user-select: none;
}

.empty-favorite {
  color: #999;
  text-align: center;
  font-size: 14px
}

.cancel-favorite {
  color: rgb(0 147 255);
  margin-right: 5px;
  font-size: 130%
}
</style>