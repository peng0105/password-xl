/**
 * 本地存储引擎
 */
import {Database, RespData} from "@/types";
import {formatterDate} from "@/utils/global.ts";

export class DatabaseForLocal implements Database {

    // 本地客户端
    private fileHandle: any = null

    // 登录并验证文件权限、初始化基本信息
    async login(form: any): Promise<RespData> {
        console.log('登录本地存储')
        const opts = {
            id: 'password-xl-local',
            startIn: 'documents',
            suggestedName: 'password-xl.txt',
            types: [
                {
                    description: 'password-xl存储',
                    accept: {
                        'text/plain': ['.txt']
                    }
                }
            ],
            excludeAcceptAllOption: true,
            multiple: false
        };

        if (form.localFileType === 'open') {
            let handle = await window.showOpenFilePicker(opts).catch(() => null)
            if (!handle) {
                return Promise.resolve({status: false});
            }
            this.fileHandle = handle[0];
        } else if (form.localFileType === 'create') {
            let handle = await window.showSaveFilePicker(opts).catch(() => null)
            if (!handle) {
                return Promise.resolve({status: false});
            }
            this.fileHandle = handle;
        }
        console.log('本地存储初始化完成')
        return Promise.resolve({status: true});
    }

    // 获取密码数据
    async getStoreData(): Promise<string> {
        console.log('local 获取密码数据')
        return new Promise(async (resolve, reject) => {
            try {
                const file = await this.fileHandle.getFile();
                const fileContent = await file.text();
                if (!fileContent) {
                    resolve('')
                    return
                }
                let data = JSON.parse(fileContent);
                resolve(data.storeData)
            } catch (err) {
                reject({status: false, message: '登录失败，请检查存储文件是否正确'})
            }
        })
    }

    // 保存密码数据
    async setStoreData(text: string): Promise<RespData> {
        console.log('local 保存密码数据')
        return new Promise(async (resolve) => {
            let writable = await this.fileHandle.createWritable();
            writable.truncate(0)
            let settingData = await this.getSettingData()
            let fileData = {
                info: this.getFileInfo(),
                storeData: text,
                settingData: settingData,
            }
            writable.write(JSON.stringify(fileData));
            writable.close()
            resolve({status: true})
        })
    }

    // 删除密码数据
    async deleteStoreData() {
        console.log('local 删除密码数据')
        return this.setStoreData('')
    }

    // 获取设置
    async getSettingData(): Promise<string> {
        console.log('local 获取设置数据')
        return new Promise(async (resolve) => {
            const file = await this.fileHandle.getFile();
            const fileContent = await file.text();
            if (!fileContent) {
                resolve('')
                return
            }

            let data = JSON.parse(fileContent);
            resolve(data.settingData)
        })
    }

    // 更新设置
    async setSettingData(text: string): Promise<RespData> {
        console.log('local 更新设置')
        return new Promise(async (resolve) => {
            let writable = await this.fileHandle.createWritable();
            writable.truncate(0)
            let storeData = await this.getStoreData().catch(() => '')
            let fileData = {
                info: this.getFileInfo(),
                storeData: storeData,
                settingData: text,
            }
            writable.write(JSON.stringify(fileData));
            writable.close()
            resolve({status: true})
        })
    }

    // 删除设置数据
    async deleteSettingData() {
        console.log('local 删除设置数据')
        return this.setSettingData('')
    }

    getFileInfo() {
        return '此文件为password-xl密码管理项目数据文件，password-xl官网：https://password-xl.cn，该文件最后更新时间为：' + formatterDate(Date.now(),'YYYY-MM-DD HH:mm')
    }
}
