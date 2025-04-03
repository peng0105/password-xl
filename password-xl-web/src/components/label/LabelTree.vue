<!--标签树组件-->
<script setup lang="ts">
import {Label, ServiceStatus} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()


const dropdownRef: Ref<{ [key: number]: any }> = ref({})

// 标签节点Ref
const labelNodeRefs: { [key: number]: Element | ComponentPublicInstance | null } = {}
// 正在编辑的标签id
const editLabelId = ref(0);

// 获取默认展开的标签（默认展开一级标签）
const getDefaultExpandedKeys = () => {
  return passwordStore.labelArray.map(label => label.id);
}

// 分组节点是否可拖拽
const labelDrag = (node: any) => {
  // 正在编辑的标签不可拖拽
  return node.data.id !== editLabelId.value
}

// 添加标签
const addLabel = (node?: any, place?: string) => {
  console.log('标签，添加标签')
  let pid = 0
  if (node) {
    pid = place === 'peer' ? node.data.pid : node.data.id
  }

  // 准备新标签
  let label = {
    id: Date.now(),
    pid: pid,
    name: '新标签',
    children: [],
  }
  // 设置当前编辑id
  editLabelId.value = label.id

  if (node) {
    if (place === 'peer') {
      // 将标签添加到选择节点后
      refStore.labelTreeRef.insertAfter(label, node.data.id);
    } else {
      // 将标签添加到选择节点内
      refStore.labelTreeRef.append(label, node.data.id);
    }
  } else {
    refStore.labelTreeRef.append(label);
  }

  // 设置选中标签并展开节点
  refStore.labelTreeRef.setCurrentKey(label.id, true)

  // 等待150ms 待标签完全展示时设置输入焦点
  setTimeout(function () {
    console.log('标签，设置输入焦点');
    (labelNodeRefs[label.id] as HTMLElement)?.focus();
  }, 150)
}

// 编辑标签
const editLabel = (node: any) => {
  console.log('标签，编辑标签: ', node.data);
  editLabelId.value = node.data.id
  // 等待150ms 待标签完全展示时设置输入焦点
  setTimeout(function () {
    (labelNodeRefs[node.data.id] as HTMLElement)?.focus();
  }, 150)
}

// 删除标签
const deleteLabel = (node: any) => {
  console.log('标签，删除标签: ', node.data);
  // 询问确认删除吗？
  ElMessageBox.confirm(
      '确认删除“' + node.data.name + '”吗？',
      '删除标签',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
  ).then(() => {
    affirmDeleteLabel(node)
  }).catch(() => {
  })
}

// 确认删除标签
const affirmDeleteLabel = (node: any) => {
  console.log('标签，确认删除标签: ', node.data);
  // 递归获取要删除的标签
  const recursionDeleteRef = (data: any, preDeleteLabel: Array<any>) => {
    preDeleteLabel.push(data.id)
    for (let i = 0; i < data.children.length; i++) {
      recursionDeleteRef(data.children[i], preDeleteLabel)
    }
  }

  let preDeleteLabel: Array<number> = []
  recursionDeleteRef(node.data, preDeleteLabel)

  // 删除密码列表中的使用的标签
  let needSyncPassword = false
  for (let i = 0; i < passwordStore.allPasswordArray.length; i++) {
    let password = passwordStore.allPasswordArray[i]
    for (let j = 0; j < password.labels.length; j++) {
      if (preDeleteLabel.includes(password.labels[j])) {
        password.labels.splice(j--, 1);
        needSyncPassword = true
      }
    }
  }

  // 删除标签
  refStore.labelTreeRef.remove(node.data.id);
  for (let i = 0; i < passwordStore.filterCondition.labelArray.length; i++) {
    if (preDeleteLabel.includes(passwordStore.filterCondition.labelArray[i])) {
      passwordStore.filterCondition.labelArray.splice(i, 1)
    }
  }

  // 删除ref
  for (let i = 0; i < preDeleteLabel.length; i++) {
    delete labelNodeRefs[preDeleteLabel[i]]
  }

  // 同步标签数据
  passwordStore.passwordManager.syncStoreData()

  // 同步密码数据
  if (needSyncPassword) {
    passwordStore.passwordManager.syncStoreData();
  }
}

// 保存标签
const saveLabel = (data: Label) => {
  console.log('标签，保存标签:', data);
  if (!data.name.trim()) {
    return;
  }
  // 防止enter和失去焦点同时出发保存
  if (editLabelId.value === 0) {
    return;
  }
  editLabelId.value = 0

  // 同步标签数据
  passwordStore.passwordManager.syncStoreData()
}

// 点击标签
const clickLabel = (node: any) => {
  if (editLabelId.value !== 0) {
    return;
  }
  refStore.labelTreeRef.setChecked(node, !node.checked)
}

// 标签过滤密码功能
const filterPassword = () => {
  let checkedKeys = refStore.labelTreeRef.getCheckedKeys()
  console.log('标签密码过滤：', checkedKeys)
  if (checkedKeys.length > 0) {
    console.log('标签密码过滤，清除收藏密码过滤：', passwordStore.filterCondition.favoriteId)
    passwordStore.filterCondition.favoriteId = 0;
  }
  passwordStore.filterCondition.labelArray = checkedKeys
}

// 右键菜单
const contextmenu = (event: MouseEvent, _id: number) => {
  console.log('标签 右键菜单')
  event.stopPropagation()
  refStore.contextmenuRef.hideContextmenu()
  for (let key in dropdownRef.value) {
    if (dropdownRef.value[key]) {
      dropdownRef.value[key].handleClose();
    }
  }
}

defineExpose({
  addLabel
})

</script>

<template>
  <el-scrollbar height="calc(50vh - 105px)">
    <el-tree
        :data="passwordStore.labelArray"
        node-key="id"
        draggable
        show-checkbox
        style="background-color: rgba(0,0,0,0);"
        @check-change="filterPassword"
        :ref="(el: any) => refStore.labelTreeRef = el"
        :check-strictly="true"
        :expand-on-click-node="false"
        @node-drop="passwordStore.passwordManager.syncStoreData()"
        :default-expanded-keys="getDefaultExpandedKeys()"
        :allow-drag="labelDrag"
    >
      <template #empty>
        <el-button
            v-if="passwordStore.serviceStatus === ServiceStatus.UNLOCKED"
            size="small"
            type="primary"
            plain @click="addLabel(null,'sub')"
        >
          创建密码标签
        </el-button>
      </template>
      <template #default="{ node, data }">
        <el-dropdown :ref="(el: any) => dropdownRef[data.id] = el" :hide-timeout="0" trigger="contextmenu" :disabled="editLabelId !== 0" style="width: 100%">
          <div
              v-if="data.id !== editLabelId"
              @click="clickLabel(node)"
              @contextmenu="contextmenu($event,data.id)"
              class="label-content">
              {{ data.name }}
          </div>
          <div v-if="data.id === editLabelId" style="width: 100%;">
            <el-input
                :ref="(el) => labelNodeRefs[node.data.id] = el"
                size="small"

                @blur="saveLabel(data)"
                @keyup.enter="saveLabel(data)"
                v-model="data.name"
            ></el-input>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="addLabel(node,'peer')">
                <span class="iconfont icon-peer-directory more-item" style="color: rgb(22 220 109)"></span>
                添加同级标签
              </el-dropdown-item>
              <el-dropdown-item @click="addLabel(node,'sub')">
                <span class="iconfont icon-sub-directory more-item" style="color: rgb(0 147 255)"></span>
                添加子级标签
              </el-dropdown-item>
              <el-dropdown-item divided @click="editLabel(node)">
                <span class="iconfont icon-edit more-item" style="color: #FF9700;font-size: 130%"></span>
                修改标签
              </el-dropdown-item>
              <el-dropdown-item @click="deleteLabel(node)">
                <span class="iconfont icon-delete more-item" style="color: rgb(255,23,23);font-size: 130%"></span>
                删除标签
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-tree>
  </el-scrollbar>
</template>

<style scoped>
.label-content {
  width: 100%;
}

.more-item {
  margin-right: 10px;
}

</style>