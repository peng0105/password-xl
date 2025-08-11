<script setup lang="ts">

import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {NoteData, TreeNote} from "@/types/types";

const loading = ref(true)
const passwordStore = usePasswordStore()
const noteData: Ref<NoteData> = ref({
  id: '',
  name: '',
  content: '',
  updateTime: 0,
})

const showNote = (treeNote: TreeNote): void => {
  loading.value = true
  passwordStore.passwordManager.getData('note/' + treeNote.id).then((data) => {
    loading.value = false
    if (data) {
      noteData.value = JSON.parse(data);
    }else{
      noteData.value = {
        id: treeNote.id,
        name: treeNote.label,
        content: '',
        updateTime: Date.now(),
      }
    }
  })
}

defineExpose({
  showNote
})
</script>

<template>
{{noteData}}
</template>

<style scoped>

</style>