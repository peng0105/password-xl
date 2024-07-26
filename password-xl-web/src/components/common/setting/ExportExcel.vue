<script setup lang="ts">
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {formatterDate, getLabelNamesByIds} from "@/utils/global.ts";
import ExcelJS from 'exceljs';
import {saveAs} from 'file-saver';
import {useRefStore} from "@/stores/RefStore.ts";

const passwordStore = usePasswordStore()
const refStore = useRefStore()

const headers = ['名称', '地址', '用户名', '密码', '标签', '备注', '创建时间', '收藏'];

// 导出密码
const exportExcel = async (downloadTemplate: boolean) => {
  console.log('导出密码 downloadTemplate:', downloadTemplate)
  if (downloadTemplate) {
    await startExportExcel(downloadTemplate)
    return
  }

  refStore.verifyPasswordRef.getAndVerify((mainPassword: string) => passwordStore.passwordManager.verifyPassword(mainPassword)).then(() => {
    console.log('导出密码 验证通过')
    startExportExcel(downloadTemplate)
  });
}
// 开始导出
const startExportExcel = async (downloadTemplate: boolean) => {
  console.log('导出密码，开始导出')
  // 创建一个新的工作簿
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  // 添加列标题
  worksheet.addRow(headers);

  if (!downloadTemplate) {
    const contents = passwordStore.allPasswordArray.map(item => {
      let labels = ''
      if (item.labels && item.labels.length) {
        labels = getLabelNamesByIds(item.labels)
      }
      let createTime = formatterDate(item.addTime, 'YYYY-MM-DD HH:mm:ss');
      return [item.title, item.address, item.username, item.password, labels, item.remark, createTime, item.favorite ? '是' : '否'];
    });
    console.log('导出密码，导出数据：', contents.length)
    // 添加数据行
    contents.forEach(item => {
      worksheet.addRow(item);
    });
  }

  // 设置首行单元格样式
  worksheet.getRow(1).eachCell((cell, index) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {argb: '00B0F0'},
    };
    cell.font = {
      bold: true,
      color: {argb: 'FFFFFF'},
    };

    // 设置列宽度
    switch (index) {
      case 1: // 名称
        worksheet.getColumn(index).width = 20;
        break;
      case 2: // 地址
        worksheet.getColumn(index).width = 30;
        break;
      case 3: // 用户名
      case 4: // 密码
      case 5: // 标签
      case 6: // 备注
      case 7: // 创建时间
        worksheet.getColumn(index).width = 20;
        break;
      case 8: // 收藏
        worksheet.getColumn(index).width = 10;
        break;
      default:
        break;
    }
  });

  console.log('导出密码，将工作簿写入缓冲区')

  // 将工作簿写入缓冲区
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type: 'application/octet-stream'});
  const fileName = downloadTemplate ? '密码导入模板.xlsx' : ('密码导出_' + formatterDate(Date.now(), 'YYYY-MM-DD HH:mm:ss') + '.xlsx')
  console.log('导出密码，保存')
  saveAs(blob, fileName);
  if (!downloadTemplate) {
    console.log('导出密码，密码导出成功')
    ElNotification.success({title: '密码导出成功', message: '请注意密码安全'});
  }
}

defineExpose({
  exportExcel
})
</script>

<template>

</template>

<style scoped>

</style>