<!--共用密码卡片-->
<script lang="ts" setup>
import { Connection, Remove } from '@element-plus/icons-vue'
import { useRelationStore } from '@/stores/RelationStore.ts'
import { usePasswordCardReveal } from '@/composables/passwordCardReveal.ts'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import {
  copyText,
  formatterDate,
  getBgColor,
  getPasswordStrengthColor,
  getPasswordStrengthTip,
  isUrl,
  sharePassword,
} from '@/utils/global.ts'
import { Password, ServiceStatus } from '@/types'
import { useRefStore } from '@/stores/RefStore.ts'
import { useSettingStore } from '@/stores/SettingStore.ts'
import { getOrderedPasswordFields, passwordFieldHasValue } from '@/utils/passwordFieldOrder.ts'

const passwordStore = usePasswordStore()
const refStore = useRefStore()
const settingStore = useSettingStore()

const props = withDefaults(
  defineProps<{
    password: Password
    selectionMode?: boolean
    selected?: boolean
    showRelation?: boolean
    relationContextId?: number
    readOnly?: boolean
    unlinkHandler?: () => void
  }>(),
  { selectionMode: false, selected: false, showRelation: true, readOnly: false },
)
const emit = defineEmits<{ 'selected-change': [selected: boolean] }>()
const relationStore = useRelationStore()
const relationCount = computed(() => passwordStore.relationIndex.get(props.password.id)?.size || 0)
const canUnlink = computed(
  () =>
    !!props.unlinkHandler ||
    (props.relationContextId !== undefined &&
      props.relationContextId !== props.password.id &&
      passwordStore.relationIndex.get(props.relationContextId)?.has(props.password.id)),
)
const unlinking = ref(false)
const unlinkRelation = async () => {
  if (props.unlinkHandler) {
    props.unlinkHandler()
    return
  }
  if (!canUnlink.value || unlinking.value || props.relationContextId === undefined) return
  unlinking.value = true
  try {
    await passwordStore.passwordManager.removePasswordRelation(
      props.relationContextId,
      props.password.id,
    )
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '解除关联失败')
  } finally {
    unlinking.value = false
  }
}
const { showPasswordId } = usePasswordCardReveal()
const isPasswordVisible = computed(() => showPasswordId.value === props.password.id)

const fieldShows: Ref<Record<string, boolean>> = ref({})

const visibleOrderedFields = computed(() =>
  getOrderedPasswordFields(props.password).filter((field) =>
    passwordFieldHasValue(props.password, field),
  ),
)
const labels = computed(() =>
  [...new Set(props.password.labels)]
    .flatMap((id) => {
      const entry = passwordStore.labelIndex.get(id)
      return entry ? [entry] : []
    })
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.label),
)
const strengthTip = computed(() => getPasswordStrengthTip(props.password.password))
const strengthColor = computed(() => getPasswordStrengthColor(props.password.password))
const updateTime = computed(() => formatterDate(props.password.updateTime, 'YYYY-MM-DD HH:mm'))

// 双击文字或操作控件时保留浏览器默认行为，仅双击卡片空白区域进入编辑模式
const cardDoubleClickIgnoreSelector = [
  '.el-text',
  '.el-link',
  '.el-tag',
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '.card-opt-icon',
  '.password-card-icon',
  '.copy-username',
].join(',')

// 批量模式下，操作控件保持原行为，其余卡片区域均可切换选择状态
const cardBatchSelectionIgnoreSelector = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '.card-opt-icon',
  '.password-card-icon',
  '.copy-username',
].join(',')

const handleCardClick = (event: MouseEvent) => {
  if (!props.selectionMode || event.detail > 1) {
    return
  }
  const target = event.target
  if (!(target instanceof Element) || target.closest(cardBatchSelectionIgnoreSelector)) {
    return
  }
  emit('selected-change', !props.selected)
}

const handleCardDoubleClick = (event: MouseEvent, password: Password) => {
  if (props.selectionMode || props.readOnly) {
    return
  }
  const target = event.target
  if (!(target instanceof Element) || target.closest(cardDoubleClickIgnoreSelector)) {
    return
  }
  refStore.passwordFormRef.editPasswordForm(password)
}

// 密码标签树Ref
const passwordLabelTreeRefs: Record<number, any> = {}
// 标签编辑草稿
const passwordLabelDrafts: Record<number, number[]> = reactive({})
// 打开标签弹框时的标签快照
const passwordLabelSnapshots: Record<number, number[]> = {}

const setPasswordLabelTreeRef = (passwordId: number, el: any) => {
  if (el) {
    passwordLabelTreeRefs[passwordId] = el
  } else {
    delete passwordLabelTreeRefs[passwordId]
  }
}

// 打开标签弹框
const showPasswordLabelPopover = (password: Password) => {
  const labels = [...password.labels]
  passwordLabelSnapshots[password.id] = labels
  passwordLabelDrafts[password.id] = [...labels]
  nextTick(() => {
    passwordLabelTreeRefs[password.id]?.setCheckedKeys(labels)
  })
}

// 更新标签编辑草稿
const changePasswordLabels = (passwordId: number) => {
  passwordLabelDrafts[passwordId] = passwordLabelTreeRefs[passwordId]?.getCheckedKeys() || []
}

const isSameLabels = (labels1: number[], labels2: number[]): boolean => {
  if (labels1.length !== labels2.length) {
    return false
  }
  const labelSet = new Set(labels1)
  return labels2.every((label) => labelSet.has(label))
}

const showSaveLabelError = (error: any) => {
  ElNotification.error({
    title: '系统异常',
    message: error?.message || String(error || '标签保存失败'),
  })
}

// 关闭标签弹框时保存
const savePasswordLabels = (password: Password) => {
  const oldLabels = passwordLabelSnapshots[password.id] || [...password.labels]
  const newLabels = passwordLabelDrafts[password.id] || [...oldLabels]
  delete passwordLabelSnapshots[password.id]
  delete passwordLabelDrafts[password.id]

  if (
    passwordStore.serviceStatus !== ServiceStatus.UNLOCKED ||
    !passwordStore.passwordById.has(password.id)
  ) {
    return
  }

  if (isSameLabels(oldLabels, newLabels)) {
    return
  }

  const updatePassword: Password = JSON.parse(JSON.stringify(password))
  updatePassword.labels = [...newLabels]
  updatePassword.updateTime = Date.now()

  try {
    passwordStore.passwordManager
      .updatePassword(updatePassword)
      .then((resp) => {
        if (!resp.status) {
          showSaveLabelError(resp.message)
        }
      })
      .catch(showSaveLabelError)
  } catch (error) {
    showSaveLabelError(error)
  }
}

// 收藏密码
const favoritePassword = async (password: Password) => {
  console.log('收藏密码：', password.id)
  try {
    await passwordStore.passwordManager.updatePassword({
      ...password,
      favorite: !password.favorite,
      favoriteTime: Date.now(),
    })
  } catch (error) {
    ElNotification.error({
      title: '收藏失败',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

// 查看密码
const showLongPassword = (password: Password) => {
  console.log('card 查看密码：', password.id)
  if (password.password.length > 40) {
    console.log('card 查看密码 长度大于40')
    // 长度大于40使用弹框展示
    refStore.showPasswordRef.showPassword(password)
    showPasswordId.value = 0
  } else {
    // 长度小于40直接在table中展示
    showPasswordId.value = password.id
  }
}

// 删除密码
const deletePassword = (password: Password) => {
  console.log('card 删除密码：', password.id)
  const manager = passwordStore.passwordManager
  // 询问确认删除吗？
  ElMessageBox.confirm('确认删除“' + password.title + '”吗？', '删除密码', {
    confirmButtonClass: 'confirm-delete-btn',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      if (
        manager !== passwordStore.passwordManager ||
        passwordStore.serviceStatus !== ServiceStatus.UNLOCKED ||
        passwordStore.passwordById.get(password.id) !== password
      ) {
        return
      }
      console.log('card 确认删除：', password.id)
      try {
        const resp = await manager.deletePassword(password.id)
        if (!resp.status) {
          console.log('card 删除密码异常：', resp.message)
          ElNotification.error({ title: '系统异常', message: resp.message })
        }
      } catch (error) {
        ElNotification.error({
          title: '删除失败',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
    .catch(() => {})
}

const cardStyle = computed(() => {
  const password = props.password
  let borderColor = passwordStore.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'
  if (!settingStore.setting.passwordColor) {
    return {
      'background-color': 'rgba(0,0,0,0)',
      'border-bottom': '1px solid ' + borderColor,
    }
  }
  return {
    'background-color': getBgColor(password.bgColor, '0.06'),
    'border-bottom': password.bgColor
      ? '1px solid ' + getBgColor(password.bgColor, '0.06')
      : '1px solid ' + borderColor,
  }
})

const backStyle = computed(() => {
  if (settingStore.setting.backgroundMode !== 'off') {
    return {
      'background-color': passwordStore.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)',
    }
  } else {
    return { 'background-color': passwordStore.isDark ? 'rgba(0,0,0,1)' : 'rgba(255,255,255,1)' }
  }
})

watch(
  () => props.password.id,
  () => {
    fieldShows.value = {}
  },
)
</script>

<template>
  <div
    class="password-card-item"
    @click="handleCardClick($event)"
    @dblclick="handleCardDoubleClick($event, password)"
  >
    <el-card
      :class="{ 'is-batch-operation': props.selectionMode, 'is-selected': props.selected }"
      :style="backStyle"
      body-style="height: 100%;"
      class="password-card"
    >
      <template #header>
        <div :style="cardStyle" class="password-header-div">
          <div>
            <el-checkbox
              v-if="props.selectionMode"
              :model-value="props.selected"
              aria-label="选择密码"
              class="batch-card-checkbox nodrag"
              @change="emit('selected-change', Boolean($event))"
              @click.stop
              @dblclick.stop
            />
            <el-tooltip
              v-if="settingStore.setting.showStrength && password.password"
              :content="strengthTip"
              placement="top"
            >
              <div :style="{ 'background-color': strengthColor }" class="password-strength"></div>
            </el-tooltip>
            <el-text style="font-size: 17px; color: #555">{{ password.title }}</el-text>
          </div>
          <div v-if="!readOnly">
            <el-tooltip :content="password.favorite ? '取消收藏' : '收藏'" placement="top">
              <span
                :class="password.favorite ? 'icon-favorited' : 'icon-collect'"
                :style="{ color: password.favorite ? '#FF9700' : 'rgb(255 151 0 / 75%)' }"
                class="iconfont icon-favorited card-opt-icon nodrag"
                style="font-size: 115%"
                @click="favoritePassword(password)"
              />
            </el-tooltip>
          </div>
        </div>
      </template>
      <ul class="password-field-ul" style="height: 100%">
        <li v-if="visibleOrderedFields.length === 0" class="empty-card">
          <el-text style="margin: 20px 0"> 空空如也！ </el-text>
        </li>
        <template v-for="orderedField in visibleOrderedFields" :key="orderedField.ref">
          <li v-if="orderedField.type === 'builtin' && orderedField.key === 'address'">
            <el-text class="password-field-name">地址:</el-text>
            <el-text class="password-field-value">
              <el-link
                v-if="isUrl(password.address)"
                :href="password.address"
                target="_blank"
                type="primary"
              >
                {{ password.address }}
              </el-link>
              <el-text v-else>{{ password.address }}</el-text>
            </el-text>
            <div class="clear"></div>
          </li>
          <li v-else-if="orderedField.type === 'builtin' && orderedField.key === 'username'">
            <el-text class="password-field-name">用户名:</el-text>
            <el-text class="password-field-value">
              <div class="card-username-div">
                <span>{{ password.username }}</span>
                <el-tooltip :hide-after="0" :show-after="300" content="复制用户名" placement="top">
                  <span
                    class="iconfont icon-copy password-row-icon copy-username"
                    @click="copyText(password.username)"
                  ></span>
                </el-tooltip>
              </div>
            </el-text>
            <div class="clear"></div>
          </li>
          <li v-else-if="orderedField.type === 'builtin' && orderedField.key === 'password'">
            <el-text class="password-field-name">密码:</el-text>
            <el-text class="password-field-value">
              <span v-if="isPasswordVisible" class="card-password-span">{{
                password.password
              }}</span>
              <span v-else style="position: relative; top: 3px">**********</span>
              <span
                v-if="isPasswordVisible"
                class="iconfont icon-hide password-card-icon"
                @click="showPasswordId = 0"
              />
              <span
                v-else
                class="iconfont icon-show password-card-icon"
                @click="showLongPassword(password)"
              />
              <span
                class="iconfont icon-copy password-card-icon"
                @click="copyText(password.password)"
              ></span>
            </el-text>
            <div class="clear"></div>
          </li>
          <li v-else-if="orderedField.type === 'builtin' && orderedField.key === 'labels'">
            <el-text class="password-field-name">标签:</el-text>
            <el-text class="password-field-value">
              <el-tag v-for="label in labels" :key="label.id" class="card-label">
                {{ label.name }}
              </el-tag>
            </el-text>
            <div class="clear"></div>
          </li>
          <li v-else-if="orderedField.type === 'builtin' && orderedField.key === 'remark'">
            <el-text class="password-field-name">备注:</el-text>
            <el-text class="password-field-value">{{ password.remark }}</el-text>
            <div class="clear"></div>
          </li>
          <li v-else-if="orderedField.type === 'custom'">
            <el-text class="password-field-name">{{ orderedField.field.key }}:</el-text>
            <el-text class="password-field-value">
              <span v-if="orderedField.field.hidden">
                <span
                  v-if="fieldShows[password.id + '_' + orderedField.field.id]"
                  class="card-password-span"
                  >{{ orderedField.field.val }}</span
                >
                <span v-else style="position: relative; top: 3px">**********</span>
                <span
                  v-if="fieldShows[password.id + '_' + orderedField.field.id]"
                  class="iconfont icon-hide password-card-icon"
                  @click="fieldShows[password.id + '_' + orderedField.field.id] = false"
                />
                <span
                  v-else
                  class="iconfont icon-show password-card-icon"
                  @click="fieldShows[password.id + '_' + orderedField.field.id] = true"
                />
                <span
                  class="iconfont icon-copy password-card-icon"
                  @click="copyText(orderedField.field.val)"
                ></span>
              </span>
              <span v-else>{{ orderedField.field.val }}</span>
            </el-text>
            <div class="clear"></div>
          </li>
        </template>
      </ul>
      <template v-if="!readOnly || canUnlink || password.updateTime" #footer>
        <div class="password-card-footer">
          <el-text v-if="password.updateTime" style="font-size: 80%" type="info"
            >{{ updateTime }}
          </el-text>
          <div class="password-card-actions">
            <el-button
              v-if="!readOnly && showRelation && relationCount > 0"
              plain
              size="small"
              type="primary"
              @click.stop="relationStore.openDrawer(password.id)"
              >关联 {{ relationCount }}</el-button
            >
            <el-popover
              v-if="!readOnly"
              :persistent="false"
              :width="260"
              placement="top"
              trigger="click"
              @after-leave="savePasswordLabels(password)"
              @before-enter="showPasswordLabelPopover(password)"
            >
              <template #reference>
                <el-button aria-label="标签" plain size="small" title="标签" type="primary">
                  <span class="iconfont icon-label card-opt-icon" />
                </el-button>
              </template>
              <el-scrollbar max-height="300px">
                <el-tree
                  v-if="passwordStore.labelArray.length"
                  :ref="(el: any) => setPasswordLabelTreeRef(password.id, el)"
                  :check-strictly="true"
                  :data="passwordStore.labelArray"
                  :default-expanded-keys="passwordStore.expandedLabelIds"
                  :props="{ label: 'name' }"
                  node-key="id"
                  show-checkbox
                  style="background-color: rgba(0, 0, 0, 0)"
                  @check-change="changePasswordLabels(password.id)"
                />
                <el-empty v-else :image-size="50" description="暂无标签" />
              </el-scrollbar>
            </el-popover>
            <el-tooltip v-if="!readOnly" content="分享" placement="top">
              <el-button plain size="small" type="success" @click="sharePassword(password)">
                <span class="iconfont icon-share card-opt-icon" />
              </el-button>
            </el-tooltip>
            <el-dropdown
              v-if="!readOnly || canUnlink"
              :persistent="false"
              class="card-more-dropdown"
              placement="top-end"
              popper-class="password-card-more-popper"
              trigger="click"
              @click.stop
              @dblclick.stop
            >
              <el-button
                aria-label="更多"
                plain
                size="small"
                title="更多"
                @click.stop
                @dblclick.stop
              >
                <span class="iconfont icon-more card-opt-icon" />
              </el-button>
              <template #dropdown>
                <el-dropdown-menu class="password-card-more-menu">
                  <el-dropdown-item
                    v-if="!readOnly && showRelation && relationCount === 0"
                    @click.stop="relationStore.openDrawer(password.id)"
                  >
                    <el-icon class="card-more-item-icon card-more-edit-icon"
                      ><Connection
                    /></el-icon>
                    关联
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="canUnlink"
                    :disabled="unlinking"
                    @click.stop="unlinkRelation"
                  >
                    <el-icon class="card-more-item-icon card-more-delete-icon"><Remove /></el-icon>
                    解除关联
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="!readOnly"
                    @click.stop="refStore.passwordFormRef.editPasswordForm(password)"
                  >
                    <span class="iconfont icon-edit card-more-item-icon card-more-edit-icon" />
                    编辑
                  </el-dropdown-item>
                  <el-dropdown-item v-if="!readOnly" @click.stop="deletePassword(password)">
                    <span class="iconfont icon-delete card-more-item-icon card-more-delete-icon" />
                    删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.password-card {
  margin: 6px;
  display: flex;
  flex-direction: column;
  height: calc(100% - 12px);
}

.password-strength {
  border-radius: 50%;
  width: 14px;
  height: 14px;
  float: left;
  margin-right: 10px;
  position: relative;
  top: 6px;
}

.card-opt-icon {
  font-size: 140%;
}

.card-label {
  margin: 0 10px 5px 0;
}

.password-field-ul {
  padding: 0;
  margin: 0;
}

.password-field-ul li {
  list-style: none;
  margin-bottom: 10px;
}

.password-field-ul li:last-child {
  margin-bottom: 0;
}

.password-field-name {
  width: 55px;
  text-align: right;
  float: left;
  font-size: 15px;
  color: #909399;
}

.password-field-value {
  float: left;
  margin-left: 15px;
  font-size: 15px;
  word-break: break-all;
}

.copy-username {
  margin-left: 10px;
}

.card-password-span {
  word-wrap: break-word;
  word-break: normal;
}

.password-card-icon,
.copy-username {
  cursor: pointer;
  padding: 5px;
  border-radius: 5px;
  font-size: 16px;
}

.password-card-icon:hover,
.copy-username:hover {
  background-color: rgba(200, 200, 200, 0.3);
  color: #409eff;
}

.password-header-div {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
}

.clear {
  clear: both;
}

.password-card-icon.icon-hide {
  font-size: 118%;
  margin-left: 5px;
}

.password-card-icon.icon-show {
  font-size: 120%;
  margin-left: 5px;
}

.card-opt-icon.icon-delete {
  font-size: 150%;
}

.password-card.is-batch-operation {
  cursor: pointer;
}

.batch-card-checkbox {
  --el-checkbox-input-height: 18px;
  --el-checkbox-input-width: 18px;
  float: left;
  height: 28px;
  margin-right: 10px;
}

.card-more-dropdown {
  margin-left: 12px;
  vertical-align: middle;
}

.empty-card {
  display: flex;
  height: 100%;
  justify-content: center;
}

:deep(.password-card .el-card__body),
:deep(.password-card .el-card__footer) {
  padding: 14px 16px;
}

:deep(.password-card .el-card__header) {
  padding: 0;
  border-bottom: 0;
}
</style>

<style>
.password-card-more-popper.el-popper {
  border-radius: 6px;
}

.password-card-more-popper .el-dropdown-menu {
  min-width: 120px;
  padding: 6px 0;
}

.password-card-more-popper .el-dropdown-menu__item {
  min-height: 42px;
  padding: 0 18px;
  font-size: 15px;
}

.password-card-more-popper .card-more-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  margin-right: 10px;
  font-size: 20px;
  line-height: 1;
}

.password-card-more-popper .card-more-edit-icon {
  color: var(--el-color-primary);
}

.password-card-more-popper .card-more-delete-icon {
  color: var(--el-color-danger);
}
</style>

<style scoped>
.password-card-item {
  min-width: 0;
  height: 100%;
}
.password-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.password-card-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.password-card-actions :deep(.el-button + .el-button),
.password-card-actions .card-more-dropdown {
  margin-left: 0;
}
.password-card.is-selected {
  border-color: var(--el-color-primary);
}
.password-card :deep(.password-header-div > div:first-child) {
  min-width: 0;
}
.password-card :deep(.password-header-div .el-text) {
  color: var(--el-text-color-primary) !important;
  overflow-wrap: anywhere;
}
</style>
