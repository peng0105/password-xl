/**
 * 私有服务存储引擎
 */
import {Database, PrivateLoginForm, RespData} from "@/types";
import axios from 'axios';

export class DatabaseForPrivate implements Database {

    // 文件名称定义
    private fileNames = {
        store: 'store.json',
        setting: 'setting.json',
        note: 'note.json',
    }

    // 文件更新标记（用于检查文件是否在其他客户端更新过，若在其他客户端更新过则强制刷新页面）
    private fileEtags: { [key: string]: string } = {}

    // 服务端地址
    private serverUrl: string = ''
    // 登录后的token
    private token: string = ''

    // 登录并验证文件权限、初始化基本信息
    async login(form: PrivateLoginForm): Promise<RespData> {
        console.log('登录私有服务')
        this.serverUrl = form.serverUrl
        return new Promise((resolve) => {
            axios.post(this.serverUrl + '/login', {username: form.username, password: form.password}).then(res => {
                console.log('私有服务登录结果：',res)
                if (res.status !== 200) {
                    resolve({status: false, message: res.statusText})
                    return
                }
                if (res.data.code !== 200) {
                    resolve({status: false, message: res.data.message})
                    return
                }
                this.token = res.data.data
                resolve({status: true})
            }).catch(err => {
                console.log('私有服务登录失败',err)
                resolve({status: false, message: this.errorDispose(err.message)})
            })
        })
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

    // 获取文件
    private async getFile(fileName: string): Promise<string> {
        console.log('获取private文件：', fileName)
        return new Promise((resolve, reject) => {
            axios.post(this.serverUrl + '/get', {key: fileName}, {headers: {Authorization: `Bearer ${this.token}`}}).then(res => {
                if (res.data.code === 500) {
                    console.log('private 获取文件错误：', res.data)
                    ElNotification.error({title: '系统异常', message: this.errorDispose(res.data.message)})
                    reject({status: false, message: res.data.message})
                    return
                }
                if (res.data.code === 404) {
                    console.log('private 获取文件404')
                    resolve('')
                    return
                }
                if (res.status === 200) {
                    this.updateEtag(fileName, res.data.data.etag)
                    resolve(res.data.data.content)
                    return
                }
                reject({status: false, message: res.statusText})
            }).catch(err => {
                ElNotification.error({title: '系统异常', message: err.message})
                reject({status: false, message: err})
            })
        })
    }

    // 上传private文件
    private async uploadFile(fileName: string, content: string): Promise<RespData> {
        console.log('上传private文件：', fileName)
        return new Promise(async (resolve, reject) => {
            // 检查文件是否为最新
            let checkResult = await this.checkEtag(fileName)
            if (!checkResult) {
                console.log('上传private文件 文件同步异常')
                ElMessageBox({
                    title: '文件同步异常',
                    message: '当前密码列表已被其他客户端更新，请刷新页面',
                    showCancelButton: false,
                    showConfirmButton: true,
                    closeOnPressEscape: false,
                    showClose: false,
                    closeOnClickModal: false,
                    confirmButtonText: '刷新',
                    callback: () => {
                        console.log('刷新');
                        location.reload()
                    }
                })
                return
            }

            axios.post(this.serverUrl + '/put', {key: fileName, content: content}, {headers: {Authorization: `Bearer ${this.token}`}}).then(res => {
                if (res.data.code === 500) {
                    console.log('private 上传文件错误：', res.data)
                    ElNotification.error({title: '系统异常', message: this.errorDispose(res.data.message)})
                    reject({status: false, message: res.data.message})
                    return
                }
                if (res.status === 200) {
                    this.updateEtag(fileName, res.data.data.etag)
                    resolve({status: true})
                    return
                }
                reject({status: false, message: res.statusText})
            }).catch(err => {
                ElNotification.error({title: '系统异常', message: err.message})
                reject({status: false, message: err})
            })
        })
    }

    // 删除private文件
    private async deleteFile(fileName: string): Promise<RespData> {
        console.log('删除private文件：', fileName)
        return new Promise((resolve, reject) => {
            axios.post(this.serverUrl + '/delete', {key: fileName}, {headers: {Authorization: `Bearer ${this.token}`}}).then(res => {
                if (res.data.code === 500) {
                    console.log('private 删除文件错误：', res.data)
                    ElNotification.error({title: '系统异常', message: this.errorDispose(res.data.message)})
                    reject({status: false, message: res.data.message})
                    return
                }
                if (res.status === 200) {
                    resolve({status: true})
                    return
                }
                reject({status: false, message: res.statusText})
            }).catch(err => {
                reject({status: false, message: err})
            })
        })
    }

    // 错误提示
    private errorDispose(err: string) {
        console.log(err)
        if (err.indexOf('Invalid URL') !== -1) {
            return '无效的服务地址'
        }
        let errMessageDist: { [key: string]: string; } = {
            'IORuntimeException: IOException: Permission denied': '服务端文件权限不足',
            'Network Error': '无法连接到服务器',
        };

        return errMessageDist[err] || err
    }

    // 获取文件标记
    private getEtag(fileName: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            axios.post(this.serverUrl + '/getEtag', {key: fileName}, {headers: {Authorization: `Bearer ${this.token}`}}).then(res => {
                if (res.data.code === 500) {
                    console.log('private 获取文件标记错误：', res.data)
                    ElNotification.error({title: '系统异常', message: this.errorDispose(res.data.message)})
                    reject({status: false, message: res.data.message})
                    return
                }
                if (res.status === 200) {
                    resolve(res.data.data.etag)
                    return
                }
                reject({status: false, message: res.statusText})
            }).catch(err => {
                ElNotification.error({title: '系统异常', message: err.message})
                reject({status: false, message: err})
            })
        })
    }

    // 检查文件标记是否与当前客户端一致
    private async checkEtag(fileName: string) {
        if (!this.fileEtags[fileName]) {
            // 标记不存在，默认通过
            return Promise.resolve(true)
        }
        let etag = await this.getEtag(fileName);
        return this.fileEtags[fileName] === etag
    }

    // 更新当前客户端文件标记
    private async updateEtag(fileName: string, etag: string) {
        console.log('private updateEtag:', etag)
        this.fileEtags[fileName] = etag
    }
}
