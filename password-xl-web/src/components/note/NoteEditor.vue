<script setup lang="ts">

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {NoteData, TreeNote} from "@/types/types";
import "aieditor/dist/style.css"
import {AiEditor} from "aieditor";
import {useNoteStore} from "@/stores/NoteStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import dayjs from "dayjs";

const refStore = useRefStore()
const loading = ref(true)
const editorRef = ref()
const lastSyncText = ref('');
const noteStore = useNoteStore()
const passwordStore = usePasswordStore()
let aiEditor: AiEditor | null = null;
const noteData: Ref<NoteData> = ref({
  id: '',
  name: '',
  content: '',
  updateTime: 0,
})

function handleBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}

const showNote = (treeNote: TreeNote): void => {
  if (noteData.value.id) {
    saveNote()
    lastSyncText.value = ''
  }
  loading.value = true;
  passwordStore.passwordManager.getData('note/' + treeNote.id + '.html').then((data) => {
    loading.value = false
    if (data) {
      noteData.value = JSON.parse(data);
    }else{
      noteData.value = {
        id: treeNote.id,
        name: treeNote.label,
        content: '',
        updateTime: Date.now(),
      }
    }
    lastSyncText.value = JSON.stringify(noteData.value)
    initEditor(noteData.value.content)
  })
}

const initEditor = (content: string) => {
  aiEditor && aiEditor.destroy();
  aiEditor = new AiEditor({
    element: editorRef.value as Element,
    toolbarKeys: [
      "brush", "eraser",
      "|", "heading", "font-family", "font-size",
      "|", "bold", "italic", "underline", "strike", "link", "code", "subscript", "superscript", "hr", "todo", "emoji",
      "|", "image", "highlight", "font-color",
      "|", "align", "line-height", "bullet-list", "ordered-list",
      "|", "quote", "code-block", "container", "table", "source-code"
    ],
    textSelectionBubbleMenu: {
      enable: true,
      items: ["Bold", "Italic", "Underline", "Strike", "code", "comment"],
    },
    image: {
      uploader: (file) => {
        return new Promise((resolve) => {
          passwordStore.passwordManager.uploadImage(file, noteData.value.id).then((data) => {
            console.log('上传data', data);
            resolve({
              "errorCode": 0,
              "data": {
                "src": data,
                "alt": file.name
              }
            })
          }).catch((e) => {
            console.log('图片上传失败', e);
            resolve({
              "errorCode": -1
            })
          })
        })
      }
    },
    placeholder: "点击输入内容...",
    content: content,
    onChange: (aiEditor) => {
      noteData.value.content = aiEditor.getHtml()
      window.addEventListener('beforeunload', handleBeforeUnload);
    }
  })
}

const saveNote = (notification = false) => {
  if (!noteData.value.id) {
    return
  }
  if (!noteData.value.name) {
    ElMessage.error('请输入标题')
    return
  }
  if (lastSyncText.value === JSON.stringify(noteData.value)) {
    if (notification) {
      ElMessage.success('保存成功')
    }
    return;
  }
  noteData.value.updateTime = Date.now()
  lastSyncText.value = JSON.stringify(noteData.value);
  passwordStore.passwordManager.setData('note/' + noteData.value.id + '.html', lastSyncText.value).then(() => {
    if (notification) {
      ElMessage.success('保存成功')
    }

    let treeNote = noteStore.getTreeNoteById(noteData.value.id)
    if (treeNote) {
      treeNote.label = noteData.value.name
      passwordStore.passwordManager.syncNoteData()
    }
    window.removeEventListener('beforeunload', handleBeforeUnload);
  })
}

// 快捷键
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key.toUpperCase() === 'S') {
    console.log('使用快捷键 Ctrl + S')
    // 阻止浏览器默认功能
    event.preventDefault();
    saveNote(true)
  }
};

onUnmounted(() => {
  aiEditor && aiEditor.destroy();
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown);
  saveNote()
});

defineExpose({
  showNote
})
</script>

<template>
  <el-card v-if="noteStore.currentNote" shadow="never" class="editor-card" style="height: calc(100% - 2px)">
    <template #header>
      <div style="display: flex;justify-content: space-between">
        <input :ref="(el: any) => refStore.noteTitleRef = el" class="title-input" placeholder="请输入标题" v-model="noteData.name"/>
        <el-text>最后更新于：{{ dayjs(noteData.updateTime).format('YYYY-MM-DD HH:mm:ss') }}</el-text>
        <el-space size="large">
          <el-button size="small" type="primary" @click="saveNote(true)" plain>保存</el-button>
        </el-space>
      </div>
    </template>

    <div ref="editorRef" style="height: calc(100vh - 66px)"/>
  </el-card>
</template>

<style>
aie-footer, .aie-codeblock-tools-comments, .aie-codeblock-tools-explain {
  display: none !important;
}
.hljs{
  font-size: 16px;
}
.aie-container {
  border: 0;
  background-color: rgba(255, 255, 255, 0);
}
.aie-container aie-header{
  background-color: rgba(255, 255, 255, 0);
}
</style>
<style scoped>
.title-input {
  font-size: 18px;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  background: transparent;
  width: 50%;
  color: #444;
}

:deep(.el-card) {
  background-color: rgba(255, 255, 255, 0.5);
}

:deep(.el-card__header) {
  padding: 10px;
}

.editor-card :deep(.el-card__body) {
  padding: 0;
}

:deep(.aie-codeblock-tools){
  padding-bottom: 5px;
}
</style>