<!--密码表单组件-->
<script lang="ts" setup>

import {copyText, displaySize, getBgColor, randomPassword} from "@/utils/global.ts";
import {GenerateRule, Password, PasswordFieldRef, PasswordStatus} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {VueDraggable} from 'vue-draggable-plus';
import {
  createCustomFieldId,
  DEFAULT_PASSWORD_FIELD_ORDER,
  finalizePasswordFieldOrder,
  getCustomFieldRef,
  getOrderedPasswordFields,
  normalizePasswordFieldOrder,
  PASSWORD_FIELD_LABELS
} from "@/utils/passwordFieldOrder.ts";

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
    // 字段显示顺序
    fieldOrder: [...DEFAULT_PASSWORD_FIELD_ORDER],
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
const passwordFieldOrder = computed<PasswordFieldRef[]>({
  get: () => passwordForm.value.fieldOrder || [],
  set: fieldOrder => passwordForm.value.fieldOrder = fieldOrder,
})
const orderedFormFields = computed(() => getOrderedPasswordFields(passwordForm.value))
const editingCustomFieldId = ref<string | null>(null)
const customFieldNameRefs: Record<string, any> = {}
let blockCustomFieldNameClick = false

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
  editingCustomFieldId.value = null
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
  editingCustomFieldId.value = null
  // 初始化生成规则表单
  generateForm.value = JSON.parse(JSON.stringify(settingStore.setting.generateRule))
  // 设置密码表单
  passwordForm.value = normalizePasswordFieldOrder(JSON.parse(JSON.stringify(password)))
  // 显示密码表单
  passwordStore.passwordFormDrawerVis = true
  // 清除校验结果
  refStore.passwordFormFormRef?.clearValidate();
}

// 关闭密码表单
const closePasswordForm = () => {
  console.log('关闭密码表单')
  editingCustomFieldId.value = null
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
  const field = {
    id: createCustomFieldId(),
    key: '',
    val: '',
    hidden: false,
  }
  passwordForm.value.customFields.push(field)
  passwordForm.value.fieldOrder?.push(getCustomFieldRef(field))
  finalizePasswordFieldOrder(passwordForm.value)
  beginCustomFieldNameEdit(field.id)
}

// 保存密码
const savePassword = async (passwordFormFormRef: any) => {
  console.log('保存密码')
  // 校验密码表单
  await passwordFormFormRef.validate((valid: any) => {
    if (!valid) return // 校验未通过
    console.log('保存密码 校验通过')
    finalizePasswordFieldOrder(passwordForm.value)
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

const delField = (fieldRef: PasswordFieldRef) => {
  if (!fieldRef.startsWith('custom:')) return
  const fieldId = fieldRef.slice('custom:'.length)
  const fieldIndex = passwordForm.value.customFields.findIndex(field => field.id === fieldId)
  if (fieldIndex !== -1) {
    passwordForm.value.customFields.splice(fieldIndex, 1)
  }
  const orderIndex = passwordForm.value.fieldOrder?.indexOf(fieldRef) ?? -1
  if (orderIndex !== -1) {
    passwordForm.value.fieldOrder?.splice(orderIndex, 1)
  }
  if (editingCustomFieldId.value === fieldId) {
    editingCustomFieldId.value = null
  }
  delete customFieldNameRefs[fieldId]
  finalizePasswordFieldOrder(passwordForm.value)
}

const beginCustomFieldNameEdit = (fieldId: string | undefined) => {
  if (!fieldId || blockCustomFieldNameClick) return
  editingCustomFieldId.value = fieldId
  nextTick(() => customFieldNameRefs[fieldId]?.focus())
}

const finishCustomFieldNameEdit = (fieldId: string | undefined) => {
  if (fieldId && editingCustomFieldId.value === fieldId) {
    editingCustomFieldId.value = null
  }
}

const setCustomFieldNameRef = (fieldId: string | undefined, el: any) => {
  if (!fieldId) return
  if (el) {
    customFieldNameRefs[fieldId] = el
  } else {
    delete customFieldNameRefs[fieldId]
  }
}

const startFieldDrag = () => {
  blockCustomFieldNameClick = true
}

const finishFieldDrag = () => {
  finalizePasswordFieldOrder(passwordForm.value)
  window.setTimeout(() => blockCustomFieldNameClick = false, 0)
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
        label-width="72px">
      <el-form-item label="名称" prop="title">
        <el-input :ref="(el: any) => refStore.passwordFormTitleRef = el" v-model="passwordForm.title"
                  autocomplete="new-password" clearable></el-input>
      </el-form-item>
      <VueDraggable
          v-model="passwordFieldOrder"
          :animation="180"
          :bubble-scroll="true"
          :delay="160"
          :delay-on-touch-only="true"
          :fallback-on-body="true"
          :fallback-tolerance="4"
          :force-fallback="true"
          :scroll="true"
          :scroll-sensitivity="56"
          :scroll-speed="12"
          :swap-threshold="0.65"
          :touch-start-threshold="5"
          chosen-class="password-field-chosen"
          class="sortable-field-list"
          direction="vertical"
          drag-class="password-field-dragging"
          draggable=".sortable-field-item"
          easing="cubic-bezier(0.2, 0, 0, 1)"
          fallback-class="password-field-fallback"
          ghost-class="password-field-ghost"
          handle=".field-drag-handle"
          @start="startFieldDrag"
          @end="finishFieldDrag"
      >
        <div
            v-for="orderedField in orderedFormFields"
            :key="orderedField.ref"
            :class="[
              orderedField.type === 'custom'?'custom-sortable-field':'builtin-sortable-field',
              {'custom-field-name-editing': orderedField.type === 'custom' && editingCustomFieldId === orderedField.field.id}
            ]"
            :data-field-ref="orderedField.ref"
            class="sortable-field-item"
        >
          <template v-if="orderedField.type === 'builtin'">
            <div class="sortable-field-name field-drag-handle">
              {{ PASSWORD_FIELD_LABELS[orderedField.key] }}
            </div>
            <div class="sortable-field-control">
              <el-input
                  v-if="orderedField.key === 'address'"
                  v-model="passwordForm.address"
                  autocomplete="new-password"
                  clearable
                  placeholder="https://"
              />
              <el-autocomplete
                  v-else-if="orderedField.key === 'username'"
                  v-model="passwordForm.username"
                  :fetch-suggestions="usernameSearch"
                  autocomplete="new-password"
                  clearable
              />
              <el-card v-else-if="orderedField.key === 'password'" class="generate-card">
                <div class="generate-input-div">
                  <el-input
                      v-model="passwordForm.password"
                      autocomplete="new-password"
                      class="generate-input"
                      clearable
                      placeholder="输入密码或随机生成"
                  >
                    <template #append>
                      <el-tooltip content="随机生成" placement="top">
                        <el-button
                            :ref="(el: any) => refStore.passwordFormGenerateBtnRef = el"
                            class="refresh-password"
                            tabindex="-1"
                            @click="generatePassword"
                        >
                          <i
                              :class="{'random-dice':playAnimate}"
                              class="iconfont icon-dice"
                              @animationend="playAnimate = false"
                          ></i>
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
                          border class="generate-type-checkbox" label="大写" size="small" tabindex="-1"
                          @change="generatePassword"
                      />
                    </el-col>
                    <el-col :sm="{span:6}" :xs="{span:12}" style="text-align: center">
                      <el-checkbox
                          v-model="generateForm.lowercase"
                          :disabled="!generateForm.uppercase && !generateForm.number && !generateForm.symbol"
                          border class="generate-type-checkbox" label="小写" size="small" tabindex="-1"
                          @change="generatePassword"
                      />
                    </el-col>
                    <el-col :sm="{span:6}" :xs="{span:12}" style="text-align: center">
                      <el-checkbox
                          v-model="generateForm.number"
                          :disabled="!generateForm.uppercase && !generateForm.lowercase && !generateForm.symbol"
                          border class="generate-type-checkbox" label="数字" size="small" tabindex="-1"
                          @change="generatePassword"
                      />
                    </el-col>
                    <el-col :sm="{span:6}" :xs="{span:12}" style="text-align: center">
                      <el-checkbox
                          v-model="generateForm.symbol"
                          :disabled="!generateForm.uppercase && !generateForm.lowercase && !generateForm.number"
                          border class="generate-type-checkbox" label="符号" size="small" tabindex="-1"
                          @change="generatePassword"
                      />
                    </el-col>
                  </el-row>
                </div>
                <div class="generate-length-div">
                  <el-slider
                      :ref="(el: any) => refStore.passwordFormGenerateRuleRef = el"
                      v-model="generateForm.length"
                      :max="32"
                      :min="4"
                      :show-input-controls="false"
                      show-input
                      size="small"
                      tabindex="-1"
                      @change="generatePassword"
                  />
                </div>
              </el-card>
              <el-tree-select
                  v-else-if="orderedField.key === 'labels'"
                  v-model="passwordForm.labels"
                  :check-strictly="true"
                  :data="passwordStore.labelArray"
                  :default-expanded-keys="getDefaultExpandedKeys()"
                  :props="{label:'name'}"
                  multiple
                  node-key="id"
                  show-checkbox
              />
              <el-input
                  v-else-if="orderedField.key === 'remark'"
                  v-model="passwordForm.remark"
                  :rows="2"
                  autocomplete="new-password"
                  placeholder="备注..."
                  type="textarea"
              />
            </div>
          </template>

          <template v-else>
            <button
                v-if="editingCustomFieldId === orderedField.field.id"
                :aria-label="`调整${orderedField.field.key || '自定义字段'}顺序`"
                class="field-drag-handle custom-field-drag-handle"
                type="button"
            >
              <span aria-hidden="true" class="drag-dots"></span>
            </button>
            <el-input
                v-if="editingCustomFieldId === orderedField.field.id"
                :ref="(el: any) => setCustomFieldNameRef(orderedField.field.id, el)"
                v-model="orderedField.field.key"
                autocomplete="off"
                class="custom-field-name-input"
                placeholder="字段名称"
                @blur="finishCustomFieldNameEdit(orderedField.field.id)"
                @keydown.enter.prevent="finishCustomFieldNameEdit(orderedField.field.id)"
                @keydown.esc.prevent="finishCustomFieldNameEdit(orderedField.field.id)"
            />
            <button
                v-else
                :aria-label="`${orderedField.field.key || '未命名字段'}，点击编辑，拖动调整顺序`"
                :class="{'is-empty': !orderedField.field.key}"
                class="sortable-field-name custom-field-name-text field-drag-handle"
                type="button"
                @click="beginCustomFieldNameEdit(orderedField.field.id)"
            >
              <span>{{ orderedField.field.key || '字段名称' }}</span>
            </button>
            <el-input
                v-model="orderedField.field.val"
                :type="orderedField.field.hidden?'password':'text'"
                autocomplete="off"
                class="custom-field-value-input"
                placeholder="字段内容"
            />
            <div class="custom-field-actions">
              <el-tooltip :content="orderedField.field.hidden?'切换为普通文本':'切换为密码'" placement="top">
                <el-button
                    :aria-label="orderedField.field.hidden?'切换为普通文本':'切换为密码'"
                    class="custom-field-action-button"
                    plain
                    @click="orderedField.field.hidden = !orderedField.field.hidden"
                >
                  <span :class="orderedField.field.hidden?'icon-hide':'icon-show'" class="iconfont"/>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除字段" placement="top">
                <el-button
                    aria-label="删除字段"
                    class="custom-field-action-button"
                    plain
                    type="danger"
                    @click="delField(orderedField.ref)"
                >
                  <span class="iconfont icon-clean"></span>
                </el-button>
              </el-tooltip>
            </div>
          </template>
        </div>
      </VueDraggable>

      <div class="add-custom-field-row">
        <el-button plain type="primary" @click="addField">添加自定义字段</el-button>
      </div>
      <el-form-item v-if="settingStore.setting.passwordColor" label="颜色" class="password-color-form-item">
        <div class="password-color-list">
          <button
              v-for="color in settingStore.setting.bgColors"
              :key="color"
              :aria-label="passwordForm.bgColor === color?'取消选择此颜色':'选择此颜色'"
              :style="{'background-color':getBgColor(color,passwordForm.bgColor === color ? '0.5':'0.3'),'transform': passwordForm.bgColor === color?'scale(1.3)':'scale(1)'}"
              class="bg-color-item"
              type="button"
              @click="passwordForm.bgColor === color?passwordForm.bgColor = '':passwordForm.bgColor = color"
          >
            <span v-show="passwordForm.bgColor === color" class="iconfont icon-check-mark"></span>
          </button>
        </div>
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

.sortable-field-list {
  margin-bottom: 8px;
}

.sortable-field-item {
  display: grid;
  align-items: start;
  min-width: 0;
  margin-bottom: 8px;
  padding: 5px 0;
  border: 1px solid transparent;
  border-radius: 7px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.builtin-sortable-field {
  grid-template-columns: 72px minmax(0, 1fr);
}

.custom-sortable-field {
  grid-template-columns: 72px minmax(0, 1fr) auto;
}

.custom-sortable-field.custom-field-name-editing {
  grid-template-columns: 28px 138px minmax(0, 1fr) auto;
}

.field-drag-handle {
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.field-drag-handle:active {
  cursor: grabbing;
}

.custom-field-drag-handle {
  width: 28px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--el-text-color-placeholder);
}

.custom-field-drag-handle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.drag-dots {
  display: inline-block;
  width: 12px;
  height: 18px;
  background-image: radial-gradient(circle, currentColor 1.4px, transparent 1.6px);
  background-position: center;
  background-size: 6px 6px;
}

.sortable-field-name {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 32px;
  padding-right: 8px;
  border-radius: 5px;
  color: var(--el-text-color-regular);
  font-size: 14px;
  text-align: right;
  white-space: nowrap;
}

.sortable-field-control {
  min-width: 0;
}

.custom-field-name-text {
  width: 100%;
  margin: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  line-height: normal;
  overflow: hidden;
}

.custom-field-name-text span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.custom-field-name-text.is-empty {
  color: var(--el-text-color-placeholder);
}

.custom-field-name-text:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.custom-field-name-input {
  width: 130px;
}

.custom-field-value-input {
  min-width: 0;
}

.custom-field-actions {
  display: flex;
  gap: 8px;
  margin-left: 8px;
}

.custom-field-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.custom-field-action-button {
  width: 32px;
  height: 32px;
  padding: 0;
}

.add-custom-field-row {
  margin: 0 0 18px 72px;
}

.password-color-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-height: 36px;
}

.password-color-form-item {
  margin-top: 2px;
}

.bg-color-item {
  width: 25px;
  height: 25px;
  padding: 0;
  border: 0;
  border-radius: 15%;
  margin: 5px 10px;
  transition: all 0.2s;
  color: white;
  cursor: pointer;
  text-align: center;
  line-height: 25px;
}

.bg-color-item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

:global(.password-field-ghost) {
  opacity: 0.3;
  border-color: var(--el-color-primary-light-5) !important;
  background-color: var(--el-color-primary-light-9) !important;
}

:global(.password-field-chosen),
:global(.password-field-dragging),
:global(.password-field-fallback) {
  border-color: var(--el-color-primary-light-3) !important;
  background-color: var(--el-bg-color) !important;
  box-shadow: var(--el-box-shadow-light);
}

@media (max-width: 520px) {
  .custom-sortable-field.custom-field-name-editing {
    grid-template-columns: 28px 118px minmax(0, 1fr) auto;
  }

  .custom-field-name-input {
    width: 110px;
  }

  .add-custom-field-row {
    margin-left: 28px;
  }

  .generate-input-div {
    flex-wrap: wrap;
    gap: 8px;
  }

  .generate-input {
    width: 100%;
    margin-right: 0;
  }
}

</style>
