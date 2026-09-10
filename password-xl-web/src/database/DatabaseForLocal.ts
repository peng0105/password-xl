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

        try {
            if (form.localFileType === 'open') {
                let handle = await window.showOpenFilePicker(opts)
                if (!handle) {
                    return Promise.resolve({status: false});
                }
                this.fileHandle = handle[0];
            } else if (form.localFileType === 'create') {
                let handle = await window.showSaveFilePicker(opts)
                if (!handle) {
                    return Promise.resolve({status: false});
                }
                this.fileHandle = handle;
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                return Promise.resolve({status: false});
            }
            console.error('本地存储文件选择失败', err)
            return Promise.resolve({status: false, message: '本地存储文件选择失败，请检查浏览器权限'});
        }
        console.log('本地存储初始化完成')
        return Promise.resolve({status: true});
    }

    // 获取密码数据
    async getStoreData(): Promise<string> {
        return (await this.readFileData()).storeData || ''
    }

    // 获取笔记数据
    async getTreeNoteData(): Promise<string> {
        return Promise.resolve('');
    }

    // 设置笔记数据
    async setNoteData(_text: string): Promise<RespData> {
        throw new Error('因为浏览器规则限制，本地存储不支持此功能，请改用其他存储方式');
    }

    // 获取数据
    async getData(_name: string): Promise<string> {
        throw new Error('因为浏览器规则限制，本地存储不支持此功能，请改用其他存储方式');
    }

    // 设置数据
    async setData(_name: string, _text: string): Promise<RespData> {
        throw new Error('因为浏览器规则限制，本地存储不支持此功能，请改用其他存储方式');
    }

    // 删除数据
    async deleteData(_name: string): Promise<RespData> {
        throw new Error('因为浏览器规则限制，本地存储不支持此功能，请改用其他存储方式');
    }

    // 上传图片
    async uploadImage(_file: File, _prefix: string): Promise<any> {
        throw new Error('因为浏览器规则限制，本地存储不支持此功能，请改用其他存储方式');
    }

    // 文件中的密码和设置共享一个写入队列，避免相互覆盖。
    private writeQueue: Promise<unknown> = Promise.resolve()

    private async readFileData(): Promise<{storeData?: string, settingData?: string}> {
        const file = await this.fileHandle.getFile()
        const content = await file.text()
        return content ? JSON.parse(content) : {}
    }

    private writeFileData(change: {storeData?: string, settingData?: string}): Promise<RespData> {
        const result = this.writeQueue.then(async () => {
            // 必须读成功才能修改；不能把读取失败当成空密码库写回。
            const previous = await this.readFileData()
            const content = JSON.stringify({info: this.getFileInfo(), ...previous, ...change})
            const writable = await this.fileHandle.createWritable()
            try {
                await writable.write(content)
                await writable.close()
                return {status: true}
            } catch (error) {
                await writable.abort().catch(() => undefined)
                throw error
            }
        })
        this.writeQueue = result.catch(() => undefined)
        return result
    }

    async setStoreData(text: string): Promise<RespData> {
        return this.writeFileData({storeData: text})
    }

    async setMainPasswordData(storeData: string, settingData: string): Promise<RespData> {
        return this.writeFileData({storeData, settingData})
    }

    async deleteStoreData(): Promise<RespData> {
        return this.setStoreData('')
    }

    async getSettingData(): Promise<string> {
        return (await this.readFileData()).settingData || ''
    }

    async setSettingData(text: string): Promise<RespData> {
        return this.writeFileData({settingData: text})
    }

    async deleteSettingData(): Promise<RespData> {
        return this.setSettingData('')
    }

    getFileInfo() {
        return '此文件为password-xl密码管理项目数据文件，password-xl官网：https://password-xl.cn，该文件最后更新时间为：' + formatterDate(Date.now(), 'YYYY-MM-DD HH:mm')
    }
}
