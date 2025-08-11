import {defineStore} from 'pinia'
import {NoteStore} from "@/types";

export const useNoteStore = defineStore('noteStore', {
    state: (): NoteStore => {
        return {
            // 密码管理器
            noteTree: [],
            // 当前选中的笔记
            currentNote: '',
        }
    }
})