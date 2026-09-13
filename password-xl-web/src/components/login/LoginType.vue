<script lang="ts" setup>
import ElectronLoginForm from '@/components/login/ElectronLoginForm.vue'
import AndroidLoginForm from '@/components/login/AndroidLoginForm.vue'
import {InfoFilled, Monitor, OfficeBuilding} from '@element-plus/icons-vue'
import logo from '@/assets/images/logo.svg'
import ossLogo from '@/assets/images/login/oss.png'
import cosLogo from '@/assets/images/login/cos.png'
const electronLoginFormRef = ref(), androidLoginFormRef = ref()
const emits = defineEmits(['loginTypeChange'])
const touchHelp = window.matchMedia('(hover: none)').matches
const isElectron = () => window.electronAPI && window.electronAPI.setTopic
const isAndroid = () => window.androidAPI && window.androidAPI.setTopic
const options = computed(() => [
  ...(!isElectron() && !isAndroid() ? [{id: 'official', title: '官方存储', image: logo, description: '免配置，密码库加密保存在官方云端，多设备随时使用。'}] : []),
  {id: 'oss', title: '阿里云 OSS', image: ossLogo, description: '使用阿里云存储服务，数据在自己的桶中，需先注册并配置权限。'},
  {id: 'cos', title: '腾讯云 COS', image: cosLogo, description: '使用腾讯云存储服务，数据在自己的桶中，需先注册并配置权限。'},
  {id: 'private', title: '私有服务', icon: OfficeBuilding, description: '部署到自己的服务器或 NAS，数据自主可控，适合有技术基础的用户。'},
  {id: 'local', title: '本地存储', icon: Monitor, description: '无需注册即可体验，数据保存在本机，不自动跨设备同步。'},
])
function select(type: string) {
  if (type === 'local' && isElectron()) { emits('loginTypeChange', 'electron'); electronLoginFormRef.value.useLocalLogin() }
  else if (type === 'local' && isAndroid()) { emits('loginTypeChange', 'android'); androidLoginFormRef.value.useLocalLogin() }
  else emits('loginTypeChange', type)
}
</script>
<template>
  <div class="storage-options">
    <div v-for="option in options" :key="option.id" class="login-type-item" :class="option.id">
      <button class="storage-select" type="button" @click="select(option.id)">
        <img v-if="option.image" :src="option.image" alt="" />
        <el-icon v-else :size="32"><component :is="option.icon" /></el-icon>
        <span>{{ option.title }}</span>
      </button>
      <span v-if="option.id === 'official'" class="recommended">推荐</span>
      <el-popover placement="top" :width="260" :trigger="touchHelp ? 'click' : 'hover'" :show-after="120">
        <template #reference><el-button class="storage-info" text circle :aria-label="option.title + '介绍'" @click.stop><el-icon><InfoFilled /></el-icon></el-button></template>
        <p class="storage-description">{{ option.description }}</p>
        <el-link :href="'https://home.password-xl.cn/docs/storage/' + option.id + '/'" target="_blank" rel="noopener" type="primary">了解更多</el-link>
      </el-popover>
    </div>
    <ElectronLoginForm ref="electronLoginFormRef" />
    <AndroidLoginForm ref="androidLoginFormRef" />
  </div>
</template>
<style scoped>
.storage-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 24px 24px 0; }
.login-type-item { position: relative; border: 1px solid var(--storage-border); border-radius: 10px; background: var(--storage-bg); color: var(--storage-color); transition: border-color .18s, box-shadow .18s; }
.login-type-item:hover { border-color: var(--storage-color); box-shadow: 0 3px 12px #162d4310; }
.storage-select { border: 0; background: none; color: inherit; font: inherit; width: 100%; min-height: 102px; padding: 20px 12px 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; cursor: pointer; border-radius: inherit; }
.storage-select:focus-visible { outline: 2px solid var(--storage-color); outline-offset: 3px; }
.storage-select img { width: 36px; height: 32px; object-fit: contain; }
.storage-select span { font-size: 14px; }
.official { grid-column: 1 / -1; --storage-bg: #effaff; --storage-border: #b8e8ff; --storage-color: #1286bd; }
.official .storage-select { flex-direction: row; min-height: 90px; gap: 16px; padding-right: 65px; padding-left: 65px; }
.official .storage-select img { width: 44px; height: 44px; }
.official .storage-select span { font-size: 17px; font-weight: 500; }
.oss { --storage-bg: #fff7f0; --storage-border: #fbe3cc; --storage-color: #c96513; }
.cos { --storage-bg: #f0f6ff; --storage-border: #d2e1fc; --storage-color: #246ee5; }
.private { --storage-bg: #f6f5fb; --storage-border: #e4e0f1; --storage-color: #756495; }
.local { --storage-bg: #f3f7f6; --storage-border: #dce7e2; --storage-color: #527f6c; }
.storage-info.el-button { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; padding: 0; color: var(--storage-color); opacity: .65; }
.storage-info:hover, .storage-info:focus-visible { opacity: 1; }
.official .storage-info { top: 2px; right: 54px; }
.recommended { position: absolute; top: 0; right: 0; padding: 4px 12px; border-radius: 0 9px 0 9px; color: #fff; background: #39bdf6; font-size: 11px; pointer-events: none; }
.storage-description { margin: 0 0 10px; line-height: 1.7; }
html.dark .login-type-item { background: color-mix(in srgb, var(--storage-color) 12%, #1d1e1f); border-color: color-mix(in srgb, var(--storage-color) 28%, #343537); color: color-mix(in srgb, var(--storage-color) 60%, white); }
@media(max-width:767px) { .storage-options { margin: 20px 18px 0; gap: 12px; } .storage-select { min-height: 96px; } }
</style>
