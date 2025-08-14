<script setup lang="ts">
import {TreeNote} from "@/types/types";
import NoteEditor from "@/components/note/NoteEditor.vue";
import router from "@/router";

const noteTreeRef = ref()
const showFirstUseMessage = ref(false)
const noteEditorRef = ref()

const toPassword = () => {
  router.push('/')
}

const addNote = (note?: TreeNote): void => {
  noteTreeRef.value.addNote(note)
}

const activateChange = (treeNote: TreeNote): void => {
  noteEditorRef.value.showNote(treeNote)
}

const closeMessage = () =>{
  showFirstUseMessage.value = false
  localStorage.setItem('firstNote', '1')
}

onMounted(() => {
  let firstNote = localStorage.getItem('firstNote')
  if (!firstNote) {
    showFirstUseMessage.value = true
  }
})

</script>

<template>
  <el-container class="note-container">
    <el-aside width="310px" class="mask" style="margin-right: 6px;">
      <div style="height: calc(100% - 2px);display: flex;flex-direction: column;">
        <el-alert @close="closeMessage" v-if="showFirstUseMessage" type="warning" style="margin-bottom: 12px;">
          笔记内容未使用主密码加密，请注意安全
        </el-alert>
        <el-card shadow="never" style="width: calc(100% - 2px);flex: 1;">
          <template #header>
            <div style="display: flex;justify-content: space-between">
              <el-text style="font-size: 18px;color: #444">目录</el-text>
              <div style="display: flex;align-items: center;">
                <el-tooltip content="密码管理">
                  <img alt="" @click="toPassword" style="height: 30px;margin-right: 10px;cursor: pointer" src="../assets/images/logo.svg">
                </el-tooltip>
                <el-tooltip content="添加笔记">
                  <el-button @click="addNote()" plain circle class="note-btn" type="primary">
                    +
                  </el-button>
                </el-tooltip>
              </div>
            </div>
          </template>
          <NoteTree ref="noteTreeRef" @activateChange="activateChange"></NoteTree>
        </el-card>
      </div>
    </el-aside>
    <el-main class="mask" style="margin-left: 6px;">
      <NoteEditor ref="noteEditorRef"></NoteEditor>
    </el-main>
  </el-container>
</template>

<style scoped>
.mask {
  height: calc(100vh - 20px);
  border: 0;
  margin: 10px;
  padding: 0;
  backdrop-filter: blur(20px);
}

:deep(.el-card) {
  background-color: rgba(255, 255, 255, 0.5);
}

:deep(.el-card__header) {
  padding: 10px;
}

:deep(.el-card__body) {
  padding: 10px;
}

:deep(.node-class) {
  font-size: 16px;
  line-height: 33px;
  height: 35px;
  width: 100%;
}

.note-btn {
  font-size: 20px;
  padding: 0;
  font-weight: 100;
  line-height: 30px;
  width: 24px;
  height: 23px;
}

.note-container {
  backdrop-filter: blur(20px);
  min-width: 900px
}
</style>