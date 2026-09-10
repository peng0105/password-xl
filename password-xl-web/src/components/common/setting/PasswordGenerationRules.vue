<script setup lang="ts">
import type {GenerateRule, PasswordCharacterRatios, PasswordCharacterType} from '@/types'
import {
  defaultGenerateRule,
  generatePassword,
  getCharacterRatios,
  passwordDist,
  rebalanceCharacterRatios,
  setCharacterRatios,
} from '@/utils/passwordGenerator.ts'

const props = defineProps<{
  modelValue: GenerateRule,
  excludedCharacters: string,
  active: boolean,
}>()
const emit = defineEmits<{
  'update:modelValue': [value: GenerateRule],
  'validation-error': [message: string],
}>()

const characterTypes = [
  {key: 'uppercase', name: '大写', icon: 'A', color: '#409eff'},
  {key: 'lowercase', name: '小写', icon: 'a', color: '#44b398'},
  {key: 'symbol', name: '符号', icon: '#', color: '#9b7ce4'},
  {key: 'number', name: '数字', icon: '7', color: '#e5a447'},
] satisfies {key: PasswordCharacterType, name: string, icon: string, color: string}[]
const presets: {name: string, ratios: PasswordCharacterRatios}[] = [
  {name: '均衡搭配', ratios: {uppercase: 25, lowercase: 25, symbol: 25, number: 25}},
  {name: '字母为主', ratios: {uppercase: 40, lowercase: 40, symbol: 10, number: 10}},
  {name: '不含符号', ratios: {uppercase: 35, lowercase: 35, symbol: 0, number: 30}},
]
const ratios = computed(() => getCharacterRatios(props.modelValue))
const preview = ref('')
const error = ref('')
let drag: {type: PasswordCharacterType, ratios: PasswordCharacterRatios} | null = null

const beginDrag = (type: PasswordCharacterType) => {
  drag = {type, ratios: {...ratios.value}}
}
const endDrag = () => { drag = null }
const updateRatio = (type: PasswordCharacterType, value: number | number[]) => {
  if (Array.isArray(value)) return
  const baseline = drag?.type === type ? drag.ratios : ratios.value
  emit('update:modelValue', setCharacterRatios(props.modelValue, rebalanceCharacterRatios(baseline, type, value)))
}
const updateLength = (value: number | number[]) => {
  if (!Array.isArray(value)) emit('update:modelValue', {...props.modelValue, length: value})
}
const selectPreset = (value: PasswordCharacterRatios) => {
  emit('update:modelValue', setCharacterRatios(props.modelValue, value))
}
const isSelected = (value: PasswordCharacterRatios) => characterTypes.every(type => ratios.value[type.key] === value[type.key])
const refreshPreview = () => {
  try {
    preview.value = generatePassword(props.modelValue, props.excludedCharacters)
    error.value = ''
  } catch (e) {
    preview.value = ''
    error.value = e instanceof Error ? e.message : '密码生成失败'
  }
  emit('validation-error', error.value)
}
const previewCharacters = computed(() => [...preview.value].map(char => ({
  char,
  color: characterTypes.find(type => passwordDist[type.key].includes(char))?.color,
})))

watch([() => props.modelValue, () => props.excludedCharacters, () => props.active], () => {
  if (props.active) refreshPreview()
  else preview.value = ''
}, {deep: true, immediate: true})
</script>

<template>
  <div class="rule-header">
    <el-text tag="b">随机密码生成规则</el-text>
    <el-button link type="primary" @click="emit('update:modelValue', defaultGenerateRule())">恢复默认</el-button>
  </div>
  <el-divider class="rule-divider"/>
  <section class="generator" aria-label="随机密码生成规则">
    <div class="length-row">
      <span>密码长度</span>
      <el-slider :model-value="modelValue.length" :min="4" :max="32" size="small"
                 aria-label="密码长度" @update:model-value="updateLength"/>
      <span class="length-value">{{ modelValue.length }} 位</span>
    </div>
    <div class="ratio-section">
      <div class="ratio-toolbar">
        <span>字符搭配比例</span>
        <div class="presets">
          <el-button v-for="preset in presets" :key="preset.name" size="small" plain
                     :type="isSelected(preset.ratios) ? 'primary' : 'default'"
                     @click="selectPreset(preset.ratios)">{{ preset.name }}</el-button>
        </div>
      </div>
      <div v-for="type in characterTypes" :key="type.key" class="ratio-row"
           :class="{off: ratios[type.key] === 0}" :style="{'--character-color': type.color}">
        <span class="type-label"><span class="type-icon">{{ type.icon }}</span>{{ type.name }}</span>
        <el-slider :model-value="ratios[type.key]" :min="0" :max="100" size="small"
                   :aria-label="type.name + '比例'" :format-tooltip="value => value + '%'"
                   @pointerdown.capture="beginDrag(type.key)" @pointercancel="endDrag"
                   @update:model-value="value => updateRatio(type.key, value)" @change="endDrag"/>
        <span class="ratio-value">{{ ratios[type.key] }}%</span>
      </div>
    </div>
    <div class="preview">
      <div class="preview-heading">
        <span>密码预览</span>
        <el-button link type="primary" :disabled="!!error" @click="refreshPreview">
          <span class="iconfont icon-refresh"/>换一个
        </el-button>
      </div>
      <div class="preview-password" aria-live="polite">
        <el-text v-if="error" type="info">请调整生成规则</el-text>
        <span v-for="(entry, index) in previewCharacters" v-else :key="index" :style="{color: entry.color}">{{ entry.char }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rule-header { display: flex; align-items: center; justify-content: space-between; min-height: 24px; }
.rule-header .el-button { font-size: 12px; }
.rule-divider { margin: 3px 0; }
.generator { margin: 14px 10px 0; border: 1px solid var(--el-border-color-light); border-radius: 7px; overflow: hidden; }
.length-row { display: grid; grid-template-columns: 83px minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 11px 23px 11px 15px; background: var(--el-fill-color-lighter); border-bottom: 1px solid var(--el-border-color-lighter); color: var(--el-text-color-regular); font-size: 13px; }
.length-value { white-space: nowrap; }
.length-row .el-slider, .ratio-row .el-slider { --el-slider-height: 4px; --el-slider-button-size: 14px; }
.ratio-section { padding: 14px 23px 13px 15px; }
.ratio-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.presets { display: flex; gap: 6px; }
.presets .el-button { margin: 0; font-size: 11px; height: 23px; padding: 5px 9px; }
.ratio-row { display: grid; grid-template-columns: 83px minmax(0, 1fr) auto; align-items: center; gap: 16px; height: 42px; }
.ratio-value { min-width: 3em; white-space: nowrap; text-align: right; font-size: 13px; color: var(--el-text-color-regular); }
.type-label { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--el-text-color-regular); }
.type-icon { display: flex; align-items: center; justify-content: center; width: 25px; height: 25px; border-radius: 5px; background: color-mix(in srgb, var(--character-color) 10%, var(--el-bg-color)); color: var(--character-color); font: 600 13px/1 Consolas, monospace; }
.ratio-row .el-slider { --el-slider-main-bg-color: var(--character-color); }
.ratio-row.off { --character-color: var(--el-text-color-placeholder) !important; }
.ratio-row.off .type-label, .ratio-row.off .ratio-value { color: var(--el-text-color-placeholder); }
.preview { padding: 10px 15px 13px; border-top: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); }
.preview-heading { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--el-text-color-secondary); }
.preview-heading .el-button { font-size: 12px; }
.preview-heading .iconfont { font-size: 13px; margin-right: 4px; }
.preview-password { min-height: 26px; margin-top: 7px; font: 600 20px/1.3 Consolas, monospace; letter-spacing: 1.4px; overflow-wrap: anywhere; }
@media (max-width: 767px) {
  .generator { margin: 12px 0 0; }
  .ratio-toolbar { flex-wrap: wrap; align-items: flex-start; gap: 9px; }
  .ratio-row, .length-row { grid-template-columns: 69px minmax(0, 1fr) auto; gap: 12px; }
  .length-row, .ratio-section { padding-right: 18px; }
}
</style>
