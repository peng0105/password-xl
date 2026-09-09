/**
 * electron存储引擎
 */
import {Database, RespData} from "@/types";

export class DatabaseForElectron implements Database {

    // 文件名称定义
    private fileNames = {
        store: 'store.json',
        setting: 'setting.json',
        note: 'password-xl/note.json',
    }

    // 登录并验证文件权限、初始化基本信息
    async login(_form: any): Promise<RespData> {
        console.log('使用electron存储')
        return Promise.resolve({status: true})
    }

    // 获取密码数据
    async getStoreData(): Promise<string> {
        return this.getFile(this.fileNames.store)
    }

    // 设置密码数据
    async setStoreData(text: string) {
        return this.uploadFile(this.fileNames.store, text)
    }

    // 获取笔记数据
    async getTreeNoteData(): Promise<string> {
        return this.getFile(this.fileNames.note)
    }

    // 设置笔记数据
    async setNoteData(text: string): Promise<RespData> {
        return this.uploadFile(this.fileNames.note, text)
    }

    // 获取数据
    async getData(name: string): Promise<string> {
        return this.getFile(name)
    }

    // 设置数据
    async setData(name: string, text: string): Promise<RespData> {
        return this.uploadFile(name, text)
    }

    // 删除密码数据
    async deleteStoreData() {
        return this.deleteFile(this.fileNames.store)
    }

    // 获取设置
    async getSettingData(): Promise<string> {
        return this.getFile(this.fileNames.setting)
    }

    // 更新设置
    async setSettingData(text: string) {
        return this.uploadFile(this.fileNames.setting, text)
    }

    // 删除设置数据
    async deleteSettingData() {
        return this.deleteFile(this.fileNames.setting)
    }

    // 删除数据
    async deleteData(name: string): Promise<RespData> {
        return this.deleteFile(name)
    }

    // 桥接调用的完成结果就是存储结果，拒绝必须传递给调用方。
    async uploadImage(file: File, prefix: string): Promise<string> {
        return window.electronAPI.uploadImage(file.name, await file.arrayBuffer(), prefix)
    }

    private async getFile(fileName: string): Promise<string> {
        return (await window.electronAPI.getFile(fileName)) || ''
    }

    private async uploadFile(fileName: string, content: string): Promise<RespData> {
        return window.electronAPI.uploadFile(fileName, content)
    }

    private async deleteFile(fileName: string): Promise<RespData> {
        return window.electronAPI.deleteFile(fileName)
    }

}
