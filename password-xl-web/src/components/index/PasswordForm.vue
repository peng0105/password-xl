<!--密码表单组件-->
<script lang="ts" setup>

import {copyText, displaySize, getBgColor, randomPassword} from "@/utils/global.ts";
import {GenerateRule, Password, PasswordStatus} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";

const refStore = useRefStore()
const passwordStore = usePasswordStore()
const settingStore = useSettingStore()

// 表单类型 add 或 edit
const formType = ref('')
// 随机密码动画
const playAnimate = ref(false)

// 初始化密码表单
const initPasswordForm = (): Password => {
  return {
    // 密码id
    id: 0,
    // 标题
    title: '',
    // 地址
    address: '',
    // 用户名
    username: '',
    // 密码
    password: '',
    // 备注
    remark: '',
    // 新增时间
    addTime: 0,
    // 修改时间
    updateTime: 0,
    // 删除时间
    deleteTime: 0,
    // 收藏时间
    favoriteTime: 0,
    // 是否收藏
    favorite: false,
    // 自定义字段
    customFields: [],
    // 标签id列表
    labels: [],
    // 密码状态 正常 or 已删除
    status: PasswordStatus.NORMAL,
    // 背景色
    bgColor: '',
  }
}

// 密码表单
const passwordForm: Ref<Password> = ref(initPasswordForm())

// 密码生成规则表单
const generateForm: Ref<GenerateRule> = ref(JSON.parse(JSON.stringify(settingStore.setting.generateRule)))

// 密码表单校验规则
const passwordFormRules = reactive({
  title: [
    {required: true, message: '请输入名称', trigger: 'blur'}
  ]
})

// 添加密码
const addPasswordForm = (title?: string) => {
  console.log('显示添加密码表单 title：', title)
  formType.value = 'add'
  // 初始化密码表单
  passwordForm.value = initPasswordForm()
  // 初始化生成规则表单
  generateForm.value = JSON.parse(JSON.stringify(settingStore.setting.generateRule))
  // 显示密码表单
  passwordStore.passwordFormDrawerVis = true
  // 清除校验结果
  refStore.passwordFormFormRef?.clearValidate();
  // 生成密码
  if (settingStore.setting.autoGeneratePassword) {
    console.log('显示添加密码表单 settingStore')
    generatePassword()
  }
  if (title) {
    nextTick(() => {
      passwordForm.value.title = title
    })
  }
  setTimeout(() => {
    console.log('显示添加密码表单 设置焦点')
    refStore.passwordFormTitleRef?.focus();
  }, 300)
}

// 设置密码字段
const setPasswordForm = (password: any) => {
  console.log('设置密码表单：', password);
  // 清除自动生成密码
  if (randomInputInterval !== null) {
    clearInterval(randomInputInterval);
  }
  if (randomInputTimeout !== null) {
    clearTimeout(randomInputTimeout);
  }
  if (password.name) {
    passwordForm.value.title = password.name;
  }
  if (password.address) {
    passwordForm.value.address = password.address;
  }
  if (password.username) {
    passwordForm.value.username = password.username;
  }
  if (password.password) {
    passwordForm.value.password = password.password;
  }
  if (password.remark) {
    passwordForm.value.remark = password.remark;
  }
  console.log('设置密码表单2：', passwordForm.value);
};

// 编辑密码
const editPasswordForm = (password: Password) => {
  console.log('显示修改密码表单：', password.id)
  formType.value = 'edit'
  // 初始化生成规则表单
  generateForm.value = JSON.parse(JSON.stringify(settingStore.setting.generateRule))
  // 设置密码表单
  passwordForm.value = JSON.parse(JSON.stringify(password))
  // 显示密码表单
  passwordStore.passwordFormDrawerVis = true
  // 清除校验结果
  refStore.passwordFormFormRef?.clearValidate();
}

// 关闭密码表单
const closePasswordForm = () => {
  console.log('关闭密码表单')
  passwordStore.passwordFormDrawerVis = false
}

// 用户名自动预测
const usernameSearch = (queryString: string, cb: any) => {
  console.log('用户名自动预测 queryString:', queryString)
  if (!queryString) {
    cb([])
    return
  }

  // 根据用户名开头预测
  let results = passwordStore.passwordArray.filter((item) => item.username.startsWith(queryString)).map((password) => {
    return {value: password.username}
  }).filter((item, index, self) => index === self.findIndex((t) => t.value === item.value))
  cb([...new Set(results)])
}

// 随机生成密码（有动画效果）
let randomInputInterval: any = null;
let randomInputTimeout: any = null;
const generatePassword = () => {
  console.log('随机生成密码');
  playAnimate.value = false;

  if (randomInputInterval !== null) {
    clearInterval(randomInputInterval);
  }

  randomInputTimeout = setTimeout(() => {
    playAnimate.value = true;
    passwordForm.value.password = '';
    // 随机生成密码
    const password = randomPassword(generateForm.value);
    if (!password) {
      return
    }
    let index = 0;
    // 模拟输入效果
    randomInputInterval = setInterval(() => {
      passwordForm.value.password += password[index++];
      if (index >= password.length) {
        clearInterval(randomInputInterval);
        randomInputInterval = null;
      }
    }, 500 / generateForm.value.length / 4);
  }, 1);
};

// 获取默认展开的标签（默认展开一级标签）
const getDefaultExpandedKeys = (): number[] => {
  return passwordStore.labelArray.map(label => label.id);
}

const addField = () => {
  if (!(passwordForm.value.customFields instanceof Array)) {
    passwordForm.value.customFields = []
  }
  passwordForm.value.customFields.push({
    key: '',
    val: '',
    hidden: false,
  })
}

// 保存密码
const savePassword = async (passwordFormFormRef: any) => {
  console.log('保存密码')
  // 校验密码表单
  await passwordFormFormRef.validate((valid: any) => {
    if (!valid) return // 校验未通过
    console.log('保存密码 校验通过')
    if (formType.value === 'add') {
      console.log('新增密码保存')
      passwordStore.passwordManager.addPassword(JSON.parse(JSON.stringify(passwordForm.value))).then(resp => {
        if (resp.status) {
          ElMessage.success('保存成功')
          passwordStore.passwordFormDrawerVis = false
        } else {
          ElNotification.error({title: '系统异常', message: resp.message,})
        }
      });
    } else {
      console.log('修改密码保存')
      passwordForm.value.updateTime = Date.now();
      passwordStore.passwordManager.updatePassword(JSON.parse(JSON.stringify(passwordForm.value))).then(resp => {
        if (resp.status) {
          ElMessage.success('修改成功')
          passwordStore.passwordFormDrawerVis = false
        } else {
          ElNotification.error({title: '系统异常', message: resp.message})
        }
      });
    }
  })
}

defineExpose({
  addPasswordForm,
  editPasswordForm,
  setPasswordForm,
  closePasswordForm,
})


// 快捷键
const handleKeyDown = (event: KeyboardEvent) => {
  if (!settingStore.setting.enableShortcutKey) {
    return
  }
  if (event.ctrlKey && event.key.toUpperCase() === 'S' && passwordStore.passwordFormDrawerVis) {
    console.log('使用快捷键 Ctrl + S')
    // 阻止浏览器默认功能
    event.preventDefault();
    savePassword(refStore.passwordFormFormRef)
  }
};

const delField = (index: number) => {
  passwordForm.value.customFields.splice(index, 1)
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <el-drawer
      v-model="passwordStore.passwordFormDrawerVis"
      :direction="['xs','sm'].includes(displaySize().value)?'btt':'rtl'"
      :show-close="false"
      :size="['xs','sm'].includes(displaySize().value)?'80%':'540px'"
  >
    <template #header>
      <el-text style="font-size: 16px">
        {{ formType === 'add' ? '添加密码' : '修改密码' }}
      </el-text>
    </template>
    <el-form
        :ref="(el: any) => refStore.passwordFormFormRef = el"
        :model="passwordForm"
        :rules="passwordFormRules"
        autocomplete="off"
        label-width="60px">
      <el-form-item label="名称" prop="title">
        <el-input :ref="(el: any) => refStore.passwordFormTitleRef = el" v-model="passwordForm.title"
                  autocomplete="new-password" clearable></el-input>
      </el-form-item>
      <el-form-item label="地址" prop="address">
        <el-input v-model="passwordForm.address" autocomplete="new-password" clearable
                  placeholder="https://"></el-input>
      </el-form-item>
      <el-form-item label="用户名" prop="username">
        <el-autocomplete
            v-model="passwordForm.username"
            :fetch-suggestions="usernameSearch"
            autocomplete="new-password"
            clearable
        />
      </el-form-item>
      <el-form-item label="密码">
        <el-card class="generate-card">
          <div class="generate-input-div">
            <el-input v-model="passwordForm.password" autocomplete="new-password" class="generate-input"
                      clearable placeholder="输入密码或随机生成">
              <template #append>
                <el-tooltip content="随机生成" placement="top">
                  <el-button :ref="(el: any) => refStore.passwordFormGenerateBtnRef = el" class="refresh-password"
                             tabindex="-1" @click="generatePassword">
                    <i :class="{'random-dice':playAnimate}" class="iconfont icon-dice"
                       @animationend="playAnimate = false"></i>
                  </el-button>
                </el-tooltip>
              </template>
            </el-input>
            <el-button plain tabindex="-1" type="success" @click="copyText(passwordForm.password)">复制</el-button>
          </div>

          <div class="generate-use-type-div">
            <el-row>
              <el-col :sm="{span:6}" :xs="{span:12}" style="text-align: center">
                <el-checkbox
                    v-model="generateForm.uppercase"
                    :disabled="!generateForm.lowercase && !generateForm.number && !generateForm.symbol"
                    border
                    class="generate-type-checkbox"
                    label="大写"
                    size="small"
                    tabindex="-1"
                    @change="generatePassword"/>
              </el-col>
              <el-col :sm="{span:6}" :xs="{span:12}" style="text-align: center">
                <el-checkbox
                    v-model="generateForm.lowercase"
                    :disabled="!generateForm.uppercase && !generateForm.number && !generateForm.symbol"
                    border
                    class="generate-type-checkbox"
                    label="小写"
                    size="small"
                    tabindex="-1"
                    @change="generatePassword"/>
              </el-col>
              <el-col :sm="{span:6}" :xs="{span:12}" style="text-align: center">
                <el-checkbox
                    v-model="generateForm.number"
                    :disabled="!generateForm.uppercase && !generateForm.lowercase && !generateForm.symbol"
                    border
                    class="generate-type-checkbox"
                    label="数字"
                    size="small"
                    tabindex="-1"
                    @change="generatePassword"/>
              </el-col>
              <el-col :sm="{span:6}" :xs="{span:12}" style="text-align: center">
                <el-checkbox
                    v-model="generateForm.symbol"
                    :disabled="!generateForm.uppercase && !generateForm.lowercase && !generateForm.number"
                    border
                    class="generate-type-checkbox"
                    label="符号"
                    size="small"
                    tabindex="-1"
                    @change="generatePassword"/>
              </el-col>
            </el-row>
          </div>
          <div class="generate-length-div">
            <el-slider
                :ref="(el: any) => refStore.passwordFormGenerateRuleRef = el"
                v-model="generateForm.length"
                :max="32"
                :min="4" :show-input-controls="false"
                show-input
                size="small"
                tabindex="-1"
                @change="generatePassword"/>
          </div>
        </el-card>
      </el-form-item>
      <el-form-item label="标签">
        <el-tree-select
            v-model="passwordForm.labels"
            :check-strictly="true"
            :data="passwordStore.labelArray"
            :default-expanded-keys="getDefaultExpandedKeys()"
            :props="{label:'name'}"
            multiple
            node-key="id"
            show-checkbox
        />
      </el-form-item>
      <el-form-item label="备注">
        <el-input
            v-model="passwordForm.remark"
            :rows="2"
            autocomplete="new-password"
            placeholder="备注..."
            type="textarea"></el-input>
      </el-form-item>
      <el-form-item v-if="settingStore.setting.passwordColor">
        <div
            v-for="color in settingStore.setting.bgColors"
            :style="{'background-color':getBgColor(color,passwordForm.bgColor === color ? '0.5':'0.3'),'transform': passwordForm.bgColor === color?'scale(1.5)':'scale(1)'}"
            class="bg-color-item"
            @click="passwordForm.bgColor === color?passwordForm.bgColor = '':passwordForm.bgColor = color">
          <span v-show="passwordForm.bgColor === color" class="iconfont icon-check-mark" style="font-size: 14px"></span>
        </div>
      </el-form-item>
      <el-form-item label="自定义">
        <el-card v-if="passwordForm.customFields && passwordForm.customFields.length > 0" style="width: 100%">
          <div v-for="(field,index) in passwordForm.customFields"
               :style="{'margin-bottom': index !== passwordForm.customFields.length - 1?'15px':'0'}"
               style="display: flex">
            <div style="margin-right: 10px;">
              <el-icon v-if="field.hidden" style="cursor: pointer;" @click="field.hidden = false">
                <span class="iconfont icon-hide"/>
              </el-icon>
              <el-icon v-else style="cursor: pointer;" @click="field.hidden = true">
                <span class="iconfont icon-show"/>
              </el-icon>
            </div>
            <el-input v-model="field.key" autocomplete="off" placeholder="名称"
                      style="margin-right: 10px;flex: 1"></el-input>
            <el-input v-model="field.val" autocomplete="off" :type="field.hidden?'password':'text'" placeholder="内容"
                      style="margin-right: 10px;flex: 2"></el-input>
            <el-button plain title="删除" type="danger" @click="delField(index)">
              <span class="iconfont icon-clean"></span>
            </el-button>
          </div>
        </el-card>
        <el-button plain style="margin-top: 10px" type="primary" @click="addField()">添加自定义信息</el-button>
      </el-form-item>
    </el-form>
    <div style="display: flex;justify-content: end">
      <el-button :ref="(el: any) => refStore.passwordFormSaveBtnRef = el"
                 type="primary" @click="savePassword(refStore.passwordFormFormRef)">保存
      </el-button>
    </div>
  </el-drawer>
</template>

<style scoped>
.refresh-password:hover {
  color: #ff0000 !important;
}

.random-dice {
  animation: rotate 0.7s;
}

@keyframes rotate {
  0% {
    transform: rotate(0deg) scale(1.5);
    color: #ff0000;
  }

  20% {
    color: #aaff00;
  }

  40% {
    color: #00ff9d;
  }

  60% {
    color: #0048ff;
  }

  80% {
    color: #dd00ff;
  }

  100% {
    transform: rotate(360deg) scale(1);
    color: #ff0000;
  }
}

.icon-dice {
  font-size: 120%;
}

.generate-card {
  width: 100%;
}

.generate-use-type-div {
  margin-top: 15px;
}

.generate-length-div {
  margin-top: 15px
}

.generate-input-div {
  display: flex;
}

.generate-input {
  margin-right: 15px
}

.generate-type-checkbox {
  margin: 5px;
  flex-wrap: wrap;
  flex: 1;
}

.bg-color-item {
  width: 25px;
  height: 25px;
  border-radius: 15%;
  margin: 5px 10px;
  transition: all 0.2s;
  color: white;
  text-align: center;
  line-height: 25px;
}

</style>