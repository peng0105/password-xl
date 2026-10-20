import { defineStore } from 'pinia'
import type { ViewportTransform, XYPosition } from '@vue-flow/core'
import { PasswordDisplayMode, ServiceStatus } from '@/types'
import { usePasswordStore } from '@/stores/PasswordStore.ts'
import { useSettingStore } from '@/stores/SettingStore.ts'
import { connectedPasswordIds } from '@/utils/passwordRelations.ts'

interface RelationNavigationEntry {
  id: number
  scrollTop: number
  expandedDirections: { incoming: boolean; outgoing: boolean }
}

export interface RelationPlacement {
  position: XYPosition
  viewport: ViewportTransform
}

export const useRelationStore = defineStore('relationStore', {
  state: () => ({
    navigation: [] as RelationNavigationEntry[],
    dialogPasswordId: null as number | null,
    dialogRetainedIds: [] as number[],
    dialogFocusId: null as number | null,
    dialogPositions: {} as Record<number, XYPosition>,
    focusId: null as number | null,
    focusPlacement: null as RelationPlacement | null,
    positions: {} as Record<number, { x: number; y: number }>,
  }),
  getters: {
    currentId: (state) => state.navigation.at(-1)?.id ?? null,
    dialogPasswordIds: (state) => {
      if (state.dialogPasswordId === null) return null
      const passwords = usePasswordStore()
      const ids = connectedPasswordIds(state.dialogPasswordId, passwords.relationIndex)
      state.dialogRetainedIds.forEach((id) => ids.add(id))
      return new Set([...ids].filter((id) => passwords.passwordById.has(id)))
    },
    canGoBack: (state) => {
      const activeIds = new Set(usePasswordStore().passwordArray.map((password) => password.id))
      return state.navigation.slice(0, -1).some((entry) => activeIds.has(entry.id))
    },
  },
  actions: {
    focusSavedPassword(id: number, placement?: RelationPlacement) {
      const passwords = usePasswordStore()
      if (passwords.serviceStatus !== ServiceStatus.UNLOCKED || !passwords.passwordById.has(id))
        return
      if (this.dialogPasswordId !== null) {
        if (this.dialogPasswordIds?.has(id)) this.dialogFocusId = id
        return
      }
      if (useSettingStore().setting.passwordDisplayMode !== PasswordDisplayMode.RELATION) return
      if (!passwords.visPasswordArray.some((password) => password.id === id)) {
        passwords.filterCondition = { searchText: '', labelArray: [], favoriteId: 0 }
      }
      passwords.showAllPasswords()
      this.closeDrawer()
      this.focusPlacement = placement
        ? { position: { ...placement.position }, viewport: { ...placement.viewport } }
        : null
      if (placement) this.positions[id] = { ...placement.position }
      this.focusId = id
    },
    openDrawer(id: number) {
      const passwords = usePasswordStore()
      if (
        passwords.serviceStatus !== ServiceStatus.UNLOCKED ||
        !passwords.passwordArray.some((p) => p.id === id)
      )
        return
      this.closeGraph()
      if (this.currentId !== id)
        this.navigation.push({
          id,
          scrollTop: 0,
          expandedDirections: { incoming: false, outgoing: false },
        })
    },
    closeDrawer() {
      this.navigation = []
    },
    back() {
      this.navigation.pop()
      const activeIds = new Set(usePasswordStore().passwordArray.map((password) => password.id))
      while (this.navigation.length && !activeIds.has(this.navigation.at(-1)!.id))
        this.navigation.pop()
    },
    openGraph(id: number) {
      const passwords = usePasswordStore()
      if (passwords.serviceStatus !== ServiceStatus.UNLOCKED || !passwords.passwordById.has(id))
        return
      this.dialogPasswordId = id
      this.dialogFocusId = null
      this.dialogRetainedIds = [...connectedPasswordIds(id, passwords.relationIndex)]
    },
    retainDialogPasswords() {
      if (this.dialogPasswordId === null) return
      // 只保留本次弹窗已展示的节点；关系和密码内容仍读取实时数据。
      this.dialogRetainedIds = [...this.dialogPasswordIds!]
    },
    closeGraph() {
      this.dialogPasswordId = null
      this.dialogFocusId = null
      this.dialogRetainedIds = []
    },
  },
})
