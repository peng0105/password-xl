<script setup lang="ts">
import ExcelJS from 'exceljs';
import {Label, Password, PasswordStatus} from "@/types";
import {
  comparePassword,
  displaySize,
  formatterDate,
  getPasswordLabelNames,
  incrId,
  parseDate,
  parseLabels
} from "@/utils/global.ts";
import {Buffer} from "buffer";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";


const passwordStore = usePasswordStore()
const refStore = useRefStore()

// 文件选择input Ref
const fileInput = ref()
// 导入确认密码列表
const passwordTableRef = ref()
// 导入确认弹框
const importAffirmVis = ref(false)

// 存储解析后的密码数组
const importPasswords: Ref<Array<Password>> = ref([]);
// 存储解析后的标签树
const importLabels: Ref<Array<Label>> = ref([]);

// 导入excel
const importExcel = async () => {
  console.log('进入导入excel')
  importPasswords.value = []
  importLabels.value = []

  fileInput.value.value = ''

  // 选择恢复文件
  fileInput.value.click()
}

// 文件选择器选择了文件
const fileChange = () => {
  let files = fileInput.value.files

  console.log('导入excel,文件选择器选择了文件：', files.length)
  if (!files.length) {
    return
  }

  const reader = new FileReader();

  // 当读取完成时执行
  reader.onload = () => {
    console.log('导入excel,文件读取完成')
    const buffer = Buffer.from(reader.result as ArrayBuffer);
    try {
      // 导入excel
      importData(buffer);
    } catch (e) {
      console.error('导入excel 导入错误', e)
      ElNotification.error('密码导入失败')
    }
  };

  // 当读取出错时执行
  reader.onerror = (error) => {
    console.error('导入excel 读取错误', error)
    ElNotification.error('读取文件失败')
  };

  // 将文件读取为ArrayBuffer
  reader.readAsArrayBuffer(files[0]);
}

// 开始解析数据
const importData = async (buffer: any) => {
  console.log('导入excel 解析excel')
  const workbook = new ExcelJS.Workbook();

  // 从文件中加载工作簿
  await workbook.xlsx.load(buffer);

  // 获取第一个工作表
  const worksheet: any = workbook.getWorksheet(1);
  if (!worksheet) {
    console.log('导入excel 导入失败，没有找到Sheet页')
    ElNotification.error('导入失败，没有找到Sheet页')
    return
  }

  let row: any = worksheet.getRow(1)
  if (!row) {
    console.log('导入excel 导入失败，文件中未找到密码数据')
    ElNotification.error('导入失败，文件中未找到密码数据')
    return
  }

  const headers: any = row.values;
  console.log('first row values:', headers)
  if (!headers || worksheet.rowCount < 2) {
    console.log('导入excel 导入失败，文件中未找到密码数据')
    ElNotification.error('导入失败，文件中未找到密码数据')
    return
  }

  // 根据列名索引
  const columnIndex = {
    id: headers.indexOf('id'),
    title: headers.indexOf('名称'),
    address: headers.indexOf('地址'),
    username: headers.indexOf('用户名'),
    password: headers.indexOf('密码'),
    remark: headers.indexOf('备注'),
    addTime: headers.indexOf('创建时间'),
    favorite: headers.indexOf('收藏'),
    labels: headers.indexOf('标签'),
    customFields: headers.indexOf('自定义信息'),
  };

  if (!columnIndex.title) {
    console.log('导入excel 导入失败，未找到密码名称列')
    ElNotification.error('导入失败，未找到密码名称列')
    return
  }

  console.log('导入excel 开始处理数据：', worksheet.rowCount)

  // 从第二行开始遍历每一行数据
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);

    let title = row.getCell(columnIndex.title)
    if (!title) {
      console.log('导入excel 密码标题不存在 第' + i + '行')
      // 密码标题不存在
      continue
    }

    let id = columnIndex.id !== -1 ? row.getCell(columnIndex.id) : null
    let address = columnIndex.address !== -1 ? row.getCell(columnIndex.address) : null
    let username = columnIndex.username !== -1 ? row.getCell(columnIndex.username) : null
    let passwordValue = columnIndex.password !== -1 ? row.getCell(columnIndex.password) : null
    let remark = columnIndex.remark !== -1 ? row.getCell(columnIndex.remark) : null
    let addTime = columnIndex.addTime !== -1 ? row.getCell(columnIndex.addTime) : null
    let labels = columnIndex.labels !== -1 ? row.getCell(columnIndex.labels) : null
    let favorite = columnIndex.favorite !== -1 ? row.getCell(columnIndex.favorite) : null
    let customFields = columnIndex.customFields !== -1 ? row.getCell(columnIndex.customFields) : null

    if (address && typeof address.value === 'object') {
      address.value = address.value.text
    }
    if (username && typeof username.value === 'object') {
      username.value = username.value.text
    }
    if (passwordValue && typeof passwordValue.value === 'object') {
      passwordValue.value = passwordValue.value.text
    }
    if (remark && typeof remark.value === 'object') {
      remark.value = remark.value.text
    }

    // 收藏
    let favoriteValue = favorite && favorite.value === '是'

    // 标签
    let passwordLabel: Array<number> = []

    if (labels && labels.value) {
      console.log('导入excel 开始解析标签树')
      // 将标签字符串解析为标签树
      let passwordLabels = parseLabels(labels.value)

      console.log('导入excel 开始合并标签树')
      // 将每个密码的标签树合并为一个标签树，用于数据确认及导入
      mergeLabelTree(importLabels.value, passwordLabels)

      console.log('导入excel 设置密码标签ids')
      // 给密码设置标签ids，仅设置叶子节点的标签
      getLeafLabelIds(passwordLabels, passwordLabel)
    }

    // 添加时间
    let timestamp = addTime && addTime.value ? parseDate(addTime.value, 'YYYY-MM-DD HH:mm:ss') : new Date()

    // 构造密码对象
    const password: Password = {
      id: id ? id.value : incrId(),
      title: title ? title.value : '',
      address: address ? address.value : '',
      username: username ? username.value : '',
      password: passwordValue ? passwordValue.value : '',
      remark: remark ? remark.value : '',
      addTime: timestamp.getTime(),
      updateTime: Date.now(),
      deleteTime: 0,
      favoriteTime: favoriteValue ? Date.now() : 0,
      favorite: favoriteValue,
      customFields: [],
      labels: passwordLabel,
      status: PasswordStatus.NORMAL,
      bgColor: '',
    };

    if (customFields && customFields.value) {
      let fieldStr = customFields.value.split('\r\n');
      for (let j = 0; j < fieldStr.length; j++) {
        let field = fieldStr[j].split("：")
        password.customFields.push({
          key: field[0],
          val: field.length > 1 ? field[1] : ''
        })
      }
    }

    // 将密码对象添加到数组中
    importPasswords.value.push(password);
  }

  console.log('导入excel 导入的数量,密码：', importPasswords.value.length, ' 标签', importLabels.value.length)
  if (importPasswords.value.length || importLabels.value.length) {
    importAffirmVis.value = true
    await nextTick(() => {
      // 全选密码列表
      console.log('导入excel 全选密码列表')
      passwordTableRef.value.toggleAllSelection()
    })
  } else {
    ElNotification.warning('没有可导入的密码')
  }
}


// 获取所有叶子节点
const getLeafLabelIds = (labelTree: Label[], result: number[] = []): number[] => {
  labelTree.forEach(label => {
    if (!label.children || label.children.length === 0) {
      result.push(label.id);
    } else {
      getLeafLabelIds(label.children, result);
    }
  });
  return result;
}

// 合并标签，若标签已存在则将要合并的标签id换成原有标签id
const mergeLabelTree = (labelArray: Array<Label>, mergeLabelArray: Array<Label>) => {
  for (let i = 0; i < mergeLabelArray.length; i++) {
    let mergeLabel = mergeLabelArray[i]
    let label = labelArray.find((label: Label) => label.name === mergeLabel.name)
    if (!label) {
      // 标签不存在合并
      labelArray.push(mergeLabel)
      continue
    }
    // 标签存在改变id
    mergeLabel.id = label.id
    mergeLabelTree(label.children, mergeLabel.children)
  }
}

// 确认导入已选中密码与标签
const affirmImport = () => {
  console.log('导入excel 确认导入已选中密码与标签')
  // 获取选中的密码列表
  const selectedPasswords: Password[] = passwordTableRef.value.getSelectionRows();

  if (!selectedPasswords.length) {
    console.log('导入excel 未选择密码')
    ElMessage.warning('请选择要导入的密码')
    return
  }

  console.log('导入excel 验证身份')
  refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then(() => {
    console.log('导入excel 确认开始导入')
    affirmImportPass()
  })
}

// 确认导入已选中密码与标签,主密码验证通过
const affirmImportPass = () => {
  try {
    passwordStore.loading('正在导入...')

    // 获取选中的密码列表
    const selectedPasswords: Password[] = passwordTableRef.value.getSelectionRows();

    // 筛选已选中的密码
    const selectedPasswordIds: number[] = selectedPasswords.map(password => password.id);
    const readyToImportPasswords: Password[] = importPasswords.value.filter(password => selectedPasswordIds.includes(password.id));

    console.log('要导入的密码：', readyToImportPasswords);
    console.log('要导入的标签：', importLabels.value);

    // 合并密码和标签
    mergePasswords(passwordStore.allPasswordArray, readyToImportPasswords);
    mergeLabels(passwordStore.labelArray, importLabels.value);

    passwordStore.passwordManager.syncStoreData()
    importAffirmVis.value = false
    importPasswords.value = []
    importLabels.value = []
    passwordStore.unloading()
    ElNotification.success('导入成功')
  } catch (e) {
    console.error(e)
    passwordStore.unloading()
    ElNotification.error('导入失败')
  }
}

// 合并密码，已存在则合并标签
const mergePasswords = (passwordArray: Password[], mergePasswordArray: Password[]) => {
  mergePasswordArray.forEach(mergePassword => {
    const existingPassword = passwordArray.find(password => comparePassword(password, mergePassword));
    if (existingPassword) {

      existingPassword.status = PasswordStatus.NORMAL
      if (mergePassword.labels) {
        // 合并标签
        const existingLabelSet = new Set(existingPassword.labels);
        mergePassword.labels.forEach(labelId => {
          if (!existingLabelSet.has(labelId)) {
            existingPassword.labels.push(labelId);
          }
        });
      }
    } else {
      // 密码不存在，直接添加
      passwordArray.push(mergePassword);
    }
  });
}

// 合并标签，已存在则更新子标签和密码中的标签id
const mergeLabels = (labelArray: Label[], mergeLabelArray: Label[]) => {
  // 使用 Map 来提高查找效率
  const labelMap = new Map(labelArray.map(label => [label.name, label]));

  mergeLabelArray.forEach(mergeLabel => {
    const existingLabel = labelMap.get(mergeLabel.name);

    if (!existingLabel) {
      // 标签不存在，直接添加
      labelArray.push(mergeLabel);
      labelMap.set(mergeLabel.name, mergeLabel);
    } else {
      // 标签存在，改变所有密码标签列表中的标签id
      replacePasswordLabel(passwordStore.allPasswordArray, mergeLabel.id, existingLabel.id);

      // 递归合并下级标签
      mergeLabels(existingLabel.children, mergeLabel.children);
    }
  });
}


// 替换密码列表中指定的标签
const replacePasswordLabel = (passwordArray: Array<Password>, oldLabelId: number, newLabelId: number) => {
  passwordArray.forEach(password => {
    password.labels = password.labels.map(label => label === oldLabelId ? newLabelId : label)
  })
}

// 删除未选中的标签
const deleteUnselectedLabels = (labelArray: Label[], selectedIds: number[]) => {
  // 过滤未选中的标签
  labelArray = labelArray.filter(label => {
    if (selectedIds.includes(label.id)) {
      // 如果标签有子标签，递归删除未选中的子标签
      if (label.children && label.children.length) {
        label.children = deleteUnselectedLabels(label.children, selectedIds);
      }
      return true;
    }
    return false;
  });
  return labelArray;
}

// 是否可选中导入判断
const selectCheck = (row: any) => {
  return !passwordStore.passwordArray.find(password => comparePassword(password, row));
}

// 导入按钮是否禁用判断
const importBtnDis = (): boolean => {
  if (!passwordTableRef.value) {
    return true
  }
  const selectedPasswords: Password[] = passwordTableRef.value.getSelectionRows();
  return !selectedPasswords.length
}

defineExpose({
  importExcel
})
</script>

<template>
  <input type="file" style="display: none" ref="fileInput" @change="fileChange()" accept=".xlsx">
  <el-dialog
      top="10vh"
      :width="['xs','sm','md'].includes(displaySize().value)?'95%':'80%'"
      title="导入信息确认"
      v-model="importAffirmVis">

    <el-table ref="passwordTableRef" :data="importPasswords" height="65vh">
      <el-table-column type="selection" :selectable="selectCheck" width="55"></el-table-column>
      <el-table-column width="55">
        <template #default="scope">
          <el-tooltip v-if="selectCheck(scope.row)" content="可导入" placement="top">
            <span class="iconfont icon-info" style="color: #409EFF;font-size: 16px"></span>
          </el-tooltip>
          <el-tooltip v-else content="已存在密码不可导入" placement="top">
            <span class="iconfont icon-info" style="color: #ff9600;font-size: 16px"></span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="名称" min-width="100px" prop="title"></el-table-column>
      <el-table-column label="地址" min-width="150px" prop="address"></el-table-column>
      <el-table-column label="用户名" min-width="100px" prop="username"></el-table-column>
      <el-table-column label="密码" width="180px" prop="password">
        <template #default="scope">
          <el-text truncated line-clamp="3">{{ scope.row.password }}</el-text>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="150px" :formatter="(row: any) => formatterDate(row.addTime,'YYYY-MM-DD HH:mm')" prop="addTime"></el-table-column>
      <el-table-column label="备注" min-width="100px" prop="remark"></el-table-column>
      <el-table-column label="标签" min-width="150px" prop="labels">
        <template #default="scope">
          <el-tag v-for="label in getPasswordLabelNames(scope.row, importLabels)" class="table-label">
            {{ label.name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="自定义信息" min-width="150px" prop="customFields">
        <template #default="scope">
          <el-tag v-for="field in scope.row.customFields" class="table-label">
            {{ field.key }}：{{ field.val }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-tooltip content="请选择要导入的密码" placement="top" :disabled="!importBtnDis()">
        <el-button type="primary" @click="affirmImport" :disabled="importBtnDis()">确认导入</el-button>
      </el-tooltip>
    </template>
  </el-dialog>
</template>

<style scoped>

.table-label {
  margin: 3px;
  cursor: default;
}

</style>