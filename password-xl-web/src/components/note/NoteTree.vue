<script lang="ts" setup>
import {TreeNote} from "@/types/types";
import {useNoteStore} from "@/stores/NoteStore.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {generateRandomId} from "@/utils/global.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {ElMessage} from "element-plus";

const refStore = useRefStore()
const noteStore = useNoteStore()
const dropdownRef: Ref<{ [key: number]: any }> = ref({})
const passwordStore = usePasswordStore()
const treeRef = ref()
const loading = ref(true)
const emits = defineEmits(['activateChange'])
const expandKeys: Ref<string[]> = ref([])

// 添加笔记
const addNote = (note?: TreeNote): void => {
  let newNote: TreeNote = {
    id: generateRandomId(),
    label: '新笔记',
    children: []
  }
  if (note) {
    if (!note.children) {
      note.children = []
    }
    note.children.push(newNote)
  } else {
    noteStore.noteData.noteTree.push(newNote)
  }

  nextTick(() => {
    treeRef.value.setCurrentKey(newNote.id + '')
    noteStore.noteData.currentNote = newNote.id + '';
    if (refStore.noteTitleRef && refStore.noteTitleRef.value) {
      refStore.noteTitleRef.focus()
    }
    passwordStore.passwordManager.syncNoteData()
  })
}

// 删除笔记
const deleteNote = (node: any): void => {
  let message = '确认删除“' + node.data.label + '”吗？'
  if (node.children && node.children.length) {
    message = '确认删除“' + node.data.label + '”及其子目录下的所有笔记吗？'
  }

  ElMessageBox.confirm(message, '删除笔记', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    affirmDeleteNote(node)
  }).catch(() => {
  })
}

const getAllChildren = (node: any) => {
  // 递归获取要删除的笔记
  const recursionDeleteRef = (data: any, preDeleteNote: Array<any>) => {
    preDeleteNote.push(data.id)
    for (let i = 0; i < data.children.length; i++) {
      recursionDeleteRef(data.children[i], preDeleteNote)
    }
  }

  let preDeleteArray: Array<string> = []
  recursionDeleteRef(node.data, preDeleteArray)
  return preDeleteArray
}

const delNoteTree = (preDeleteArray: Array<string>, noteTree: Array<TreeNote>) => {
  for (let i = noteTree.length - 1; i >= 0; i--) {
    if (noteTree[i].children) {
      delNoteTree(preDeleteArray, noteTree[i].children);
    }
    if (preDeleteArray.includes(noteTree[i].id)) {
      console.log('删除笔记', noteTree[i].id)
      noteTree.splice(i, 1);
    }
  }
}

// 确认删除笔记
const affirmDeleteNote = (node: any) => {
  // 获取要删除的笔记和子目录下的笔记
  let preDeleteArray = getAllChildren(node)

  for (let i = 0; i < preDeleteArray.length; i++) {
    let name = 'note/' + preDeleteArray[i] + '.html'
    passwordStore.passwordManager.delData(name)
    nodeCollapse(preDeleteArray[i])
  }

  delNoteTree(preDeleteArray, noteStore.noteData.noteTree)

  if (noteStore.noteData.currentNote) {
    if (preDeleteArray.includes(noteStore.noteData.currentNote)) {
      noteStore.noteData.currentNote = ''
    }
  }

  // 同步笔记数据
  passwordStore.passwordManager.syncNoteData()

  ElMessage.success('删除成功')
}

// 右键菜单
const contextmenu = (event: MouseEvent, _id: number) => {
  event.stopPropagation()
  for (let key in dropdownRef.value) {
    if (dropdownRef.value[key]) {
      dropdownRef.value[key].handleClose();
    }
  }
}

// 选择发生变化
const currentChange = (treeNote: TreeNote): void => {
  if (noteStore.noteData.currentNote === treeNote.id) {
    return
  }
  noteStore.noteData.currentNote = treeNote.id;
  emits('activateChange', treeNote)
  passwordStore.passwordManager.syncNoteData()
}

// 节点展开
const nodeExpand = (id: string) => {
  expandKeys.value.push(id)
  localStorage.setItem('expandKeys', JSON.stringify(expandKeys.value))
}

// 节点收起
const nodeCollapse = (id: string) => {
  expandKeys.value = expandKeys.value.filter((item: string) => item !== id)
  localStorage.setItem('expandKeys', JSON.stringify(expandKeys.value))
}

onMounted(() => {
  expandKeys.value = JSON.parse(localStorage.getItem('expandKeys') || '[]')
  loading.value = false
  nextTick(() => {
    if (noteStore.noteData.currentNote) {
      treeRef.value.setCurrentKey(noteStore.noteData.currentNote);
      let node = treeRef.value.getCurrentNode()
      if (node) {
        emits('activateChange', node);
      }
    }
  })
})

defineExpose({
  addNote
})

</script>

<template>
  <div v-if="!loading" class="note-tree">
    <el-tree
        ref="treeRef"
        :data="noteStore.noteData.noteTree"
        :default-expanded-keys="expandKeys"
        :expand-on-click-node="false"
        draggable
        highlight-current
        node-key="id"
        style="max-width: 600px"
        @node-expand="(node) => nodeExpand(node.id)"
        @node-collapse="(node) => nodeCollapse(node.id)"
        @current-change="currentChange"
        @node-drop="() => passwordStore.passwordManager.syncNoteData()"
    >
      <template #default="{node, data }">
        <el-dropdown
            :ref="(el: any) => dropdownRef[data.id] = el"
            style="width: 100%"
            trigger="contextmenu">
          <div class="node-class" @contextmenu="contextmenu($event,data.id)">
            <el-text :style="{'color': noteStore.noteData.currentNote === data.id?'#409EFF':''}" style="width: 85%;"
                     truncated>
              {{ data.label }}
            </el-text>
          </div>
          <template #dropdown>
            <el-dropdown-menu style="width: 100px;">
              <el-dropdown-item @click="addNote(data)">
                <span class="iconfont icon-create more-item" style="color: rgb(0 147 255)"></span>
                新笔记
              </el-dropdown-item>
              <el-dropdown-item @click="deleteNote(node)">
                <span class="iconfont icon-delete more-item" style="color: rgb(255,23,23);font-size: 130%"></span>
                删除
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-tree>
  </div>
</template>
<style>
.note-tree .el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content {
  background-color: rgba(100, 100, 100, 0.1);
}

</style>
<style scoped>
:deep(.el-tree-node__content) {
  border-radius: 4px;
}

:deep(.el-tree-node__content):hover {
  background-color: rgba(150, 150, 150, 0.1);
}

:deep(.el-tree) {
  background-color: rgba(255, 255, 255, 0);
}


:deep(.node-class) {
  font-size: 16px;
  line-height: 33px;
  height: 35px;
  width: 100%;
}

.el-tree {
  --el-tree-node-content-height: 35px;
}

:deep(.el-tree-node__expand-icon) {
  font-size: 18px;
}

.more-item {
  margin-right: 10px;
}

</style>