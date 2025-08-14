import {defineStore} from 'pinia'
import {NoteStore} from "@/types";
import {TreeNote} from "@/types/types";

export const useNoteStore = defineStore('noteStore', {
    state: (): { noteData: NoteStore } => {
        return {
            noteData: {
                // 密码管理器
                noteTree: [],
                // 当前选中的笔记
                currentNote: '',
            }
        }
    },
    actions: {
        getTreeNoteById(this: any, id: string, nodes = this.noteData.noteTree): TreeNote | null {
            for (const node of nodes) {
                if (node.id === id) return node;
                if (node.children) {
                    const found = this.getTreeNoteById(id, node.children);
                    if (found) return found;
                }
            }
            return null;
        }
    }
})