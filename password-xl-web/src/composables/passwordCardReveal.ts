import { inject, provide, ref, watch } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import { ServiceStatus } from '@/types'
import { usePasswordStore } from '@/stores/PasswordStore.ts'

const key: InjectionKey<{ showPasswordId: Ref<number> }> = Symbol('passwordCardReveal')

export const providePasswordCardReveal = () => {
  const state = { showPasswordId: ref(0) }
  const store = usePasswordStore()
  watch(
    () => store.serviceStatus,
    (status) => {
      if (status !== ServiceStatus.UNLOCKED) state.showPasswordId.value = 0
    },
  )
  provide(key, state)
  return state
}

export const usePasswordCardReveal = () => inject(key, { showPasswordId: ref(0) })
