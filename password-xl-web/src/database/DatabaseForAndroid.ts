/**
 * android存储引擎
 */
import {Database, RespData} from "@/types";

export class DatabaseForAndroid implements Database {

    // 文件名称定义
    private fileNames = {
        store: 'store.json',
        setting: 'setting.json',
    }

    // 登录并验证文件权限、初始化基本信息
    async login(_form: any): Promise<RespData> {
        console.log('使用android存储')
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

    // 获取android文件
    private async getFile(fileName: string): Promise<string> {
        console.log('获取android文件', fileName)
        return new Promise(async (resolve) => {
            let data = await window.androidAPI.getFile(fileName)
            if (data) {
                resolve(data);
            } else {
                resolve('')
            }
        })
    }

    // 上传android文件
    private async uploadFile(fileName: string, content: string): Promise<RespData> {
        console.log('上传android文件', fileName)
        return new Promise(async (resolve) => {
            window.androidAPI.uploadFile(fileName, content)
            resolve({status: true})
        })
    }

    // 删除android文件
    private async deleteFile(fileName: string): Promise<RespData> {
        console.log('删除android文件', fileName)
        return new Promise((resolve) => {
            window.androidAPI.deleteFile(fileName)
            resolve({status: true})
        })
    }
}
