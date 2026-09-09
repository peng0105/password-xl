<script lang="ts" setup>

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {NoteData, TreeNote} from "@/types/types";
import "aieditor/dist/style.css"
import {AiEditor} from "aieditor";
import {useNoteStore} from "@/stores/NoteStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import dayjs from "dayjs";
import {onBeforeRouteLeave} from "vue-router";

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

let loadSequence = 0
let disposed = false
let saveQueue: Promise<boolean> = Promise.resolve(true)
let autoSaveTimeout: ReturnType<typeof setTimeout> | undefined

const isDirty = () => !!noteData.value.id && lastSyncText.value !== JSON.stringify(noteData.value)
const updateUnloadWarning = () => {
  if (isDirty()) window.addEventListener('beforeunload', handleBeforeUnload)
  else window.removeEventListener('beforeunload', handleBeforeUnload)
}

const saveNote = (notification = false): Promise<boolean> => {
  clearTimeout(autoSaveTimeout)
  // 目录已经删除的笔记不再自动写回。
  if (!noteData.value.id || !noteStore.getTreeNoteById(noteData.value.id)) return Promise.resolve(true)
  if (!noteData.value.name.trim()) {
    ElMessage.error('请输入标题')
    return Promise.resolve(false)
  }
  if (!isDirty()) {
    return saveQueue.then(saved => {
      if (saved && notification && !disposed) ElMessage.success('保存成功')
      return saved
    })
  }
  noteData.value.updateTime = Date.now()
  const snapshot = {...noteData.value}
  const text = JSON.stringify(snapshot)
  const result = saveQueue.then(async () => {
    try {
      if (lastSyncText.value !== text) {
        const response = await passwordStore.passwordManager.setData('note/' + snapshot.id + '.html', text)
        if (response?.status !== true) throw new Error(response?.message || '笔记保存失败，请重试')
        const treeNote = noteStore.getTreeNoteById(snapshot.id)
        if (treeNote && treeNote.label !== snapshot.name) {
          treeNote.label = snapshot.name
          const treeResponse = await passwordStore.passwordManager.syncNoteData()
          if (treeResponse?.status !== true) throw new Error(treeResponse?.message || '笔记标题保存失败，请重试')
        }
        // 仅确认本次快照；保存期间的新编辑仍然是未保存状态。
        if (!disposed && noteData.value.id === snapshot.id) lastSyncText.value = text
      }
      if (!disposed) {
        updateUnloadWarning()
        if (notification) ElMessage.success('保存成功')
      }
      return true
    } catch (error) {
      if (!disposed) {
        updateUnloadWarning()
        ElMessage.error(error instanceof Error ? error.message : '笔记保存失败，请重试')
      }
      return false
    }
  })
  saveQueue = result
  return result
}

const showNote = async (treeNote: TreeNote): Promise<boolean> => {
  const sequence = ++loadSequence
  const previousId = noteData.value.id
  loading.value = true
  clearTimeout(autoSaveTimeout)
  try {
    // 保存失败就保留原笔记，用户仍可重试，不能直接用下一篇覆盖编辑区。
    if (!(await saveNote()) || disposed || sequence !== loadSequence) return false
    const data = await passwordStore.passwordManager.getData('note/' + treeNote.id + '.html')
    if (disposed || sequence !== loadSequence) return false
    const nextNote: NoteData = data ? JSON.parse(data) : {
      id: treeNote.id, name: treeNote.label, content: '', updateTime: Date.now(),
    }
    if (nextNote.id !== treeNote.id || typeof nextNote.content !== 'string' || typeof nextNote.name !== 'string') {
      throw new Error('笔记内容格式不正确，未切换笔记')
    }
    noteStore.noteData.currentNote = treeNote.id
    const response = await passwordStore.passwordManager.syncNoteData()
    if (response?.status !== true) throw new Error(response?.message || '笔记目录保存失败')
    if (disposed || sequence !== loadSequence) return false
    noteData.value = nextNote
    lastSyncText.value = JSON.stringify(nextNote)
    // 首次选择时 el-card 才挂载，等编辑器容器出现后再初始化。
    await nextTick()
    if (disposed || sequence !== loadSequence) return false
    initEditor(nextNote.content)
    updateUnloadWarning()
    return true
  } catch (error) {
    if (!disposed && sequence === loadSequence) {
      if (noteStore.noteData.currentNote === treeNote.id) noteStore.noteData.currentNote = previousId
      ElMessage.error(error instanceof Error ? error.message : '笔记加载失败，请重试')
    }
    return false
  } finally {
    if (!disposed && sequence === loadSequence) loading.value = false
  }
}

const scheduleSave = () => {
  if (loading.value || disposed) return
  updateUnloadWarning()
  clearTimeout(autoSaveTimeout)
  autoSaveTimeout = setTimeout(() => { void saveNote() }, 500)
}

// 标题修改也需要自动保存和离开页面保护。
watch(() => noteData.value.name, scheduleSave)

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
      if (disposed || loading.value) return
      noteData.value.content = aiEditor.getHtml()
      scheduleSave()
    }
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

onBeforeRouteLeave(async () => {
  loadSequence++
  loading.value = true
  const saved = await saveNote()
  loading.value = false
  return saved
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  disposed = true
  loadSequence++
  clearTimeout(autoSaveTimeout)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('keydown', handleKeyDown)
  aiEditor?.destroy()
  aiEditor = null
});

defineExpose({
  showNote
})
</script>

<template>
  <el-card v-if="noteStore.noteData.currentNote" class="editor-card" shadow="never" style="height: calc(100% - 2px)">
    <template #header>
      <div style="display: flex;justify-content: space-between">
        <input :ref="(el: any) => refStore.noteTitleRef = el" v-model="noteData.name" :disabled="loading" class="title-input"
               placeholder="请输入标题"/>
        <el-text>最后更新于：{{ dayjs(noteData.updateTime).format('YYYY-MM-DD HH:mm:ss') }}</el-text>
        <el-space size="large">
          <el-button plain size="small" type="primary" :disabled="loading" @click="saveNote(true)">保存</el-button>
        </el-space>
      </div>
    </template>
    <div ref="editorRef" v-loading="loading" element-loading-text="加载中，别急" style="height: calc(100vh - 66px)"/>
  </el-card>
</template>

<style>
aie-footer, .aie-codeblock-tools-comments, .aie-codeblock-tools-explain {
  display: none !important;
}

.hljs {
  font-size: 16px;
}

.aie-container {
  border: 0;
  background-color: rgba(255, 255, 255, 0);
}

.aie-container aie-header {
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
  font-weight: bold;
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

:deep(.aie-codeblock-tools) {
  padding-bottom: 5px;
}
</style>
