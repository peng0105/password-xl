<script setup lang="ts">
import {TreeNote} from "@/types/types";
import {useNoteStore} from "@/stores/NoteStore.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {generateRandomId} from "@/utils/global.ts";

const noteStore = useNoteStore()
const dropdownRef: Ref<{ [key: number]: any }> = ref({})
const passwordStore = usePasswordStore()
const treeRef = ref()
const emits = defineEmits(['activateChange'])

// 添加笔记
const addNote = (note?: TreeNote): void => {
  let newNote: TreeNote = {
    id: generateRandomId(),
    label: '新分类',
    expand: false,
    children: []
  }
  if (note) {
    if (!note.children) {
      note.children = []
    }
    note.children.push(newNote)
  } else {
    noteStore.noteTree.push(newNote)
  }

  nextTick(() => {
    treeRef.value.setCurrentKey(newNote.id + '')
    noteStore.currentNote = newNote.id + ''
    passwordStore.passwordManager.syncNoteData()
  })
}

// 删除笔记
const deleteNote = (node: any): void => {
  // 询问确认删除吗？
  ElMessageBox.confirm(
      '确认删除“' + node.data.label + '”吗？',
      '删除笔记',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
  ).then(() => {
    affirmDeleteNote(node)
  }).catch(() => {
  })
}

// 确认删除笔记
const affirmDeleteNote = (node: any) => {
  // 递归获取要删除的笔记
  const recursionDeleteRef = (data: any, preDeleteNote: Array<any>) => {
    preDeleteNote.push(data.id)
    for (let i = 0; i < data.children.length; i++) {
      recursionDeleteRef(data.children[i], preDeleteNote)
    }
  }

  let preDeleteArray: Array<string> = []
  recursionDeleteRef(node.data, preDeleteArray)

  function delNoteTree(preDeleteArray: Array<string>, noteTree: Array<TreeNote>) {
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

  delNoteTree(preDeleteArray, noteStore.noteTree)

  // 同步笔记数据
  passwordStore.passwordManager.syncNoteData()
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
  if (noteStore.currentNote === treeNote.id) {
    return
  }
  noteStore.currentNote = treeNote.id;
  emits('activateChange', treeNote)
  passwordStore.passwordManager.syncNoteData()
}

// 节点展开
const nodeExpand = (data: TreeNote) => {
  data.expand = true
  passwordStore.passwordManager.syncNoteData()
}

// 节点收起
const nodeCollapse = (data: TreeNote) => {
  data.expand = false
  passwordStore.passwordManager.syncNoteData()
}

onMounted(() => {
  if (noteStore.currentNote) {
    treeRef.value.setCurrentKey(noteStore.currentNote);
    let node = treeRef.value.getCurrentNode()
    if (node) {
      emits('activateChange', node);
    }
  }
})

defineExpose({
  addNote
})

</script>

<template>
  <div class="note-tree">
    <el-tree
        style="max-width: 600px"
        :data="noteStore.noteTree"
        ref="treeRef"
        :expand-on-click-node="false"
        :node-expand="nodeExpand"
        :node-collapse="nodeCollapse"
        node-key="id"
        highlight-current
        draggable
        @current-change="currentChange"
        @node-drop="passwordStore.passwordManager.syncNoteData()"
    >
      <template #default="{node, data }">
        <el-dropdown
            :ref="(el: any) => dropdownRef[data.id] = el"
            :hide-timeout="0"
            trigger="contextmenu"
            style="width: 100%">
          <div @contextmenu="contextmenu($event,data.id)" class="node-class">
            {{ data.label }}
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="addNote(data)">
                <span class="iconfont icon-create more-item" style="color: rgb(0 147 255)"></span>
                添加
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
  background-color: rgba(100,100, 100, 0.1);
  font-weight: bold;
}
</style>
<style scoped>
:deep(.el-tree-node__content) {
  border-radius: 4px;
}

:deep(.el-tree-node__content):hover {
  background-color: rgba(150,150, 150, 0.1);
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