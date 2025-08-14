/**
 * 腾讯云COS存储引擎
 */
import {Database, RespData} from "@/types";
import COS from "cos-js-sdk-v5";
import {COSLoginForm} from "@/types/index.ts";
import {generateRandomId} from "@/utils/global.ts";

export class DatabaseForCOS implements Database {

    // 文件名称定义
    private fileNames = {
        store: 'password-xl/store.json',
        setting: 'password-xl/setting.json',
        note: 'password-xl/note.json',
    }

    // 文件更新标记（用于检查文件是否在其他客户端更新过，若在其他客户端更新过则强制刷新页面）
    private fileEtags: { [key: string]: string } = {}

    // cos 客户端
    private cosClient: COS | null = null

    private region: string = '';
    private bucket: string = '';

    // 登录并验证文件权限、初始化基本信息
    async login(form: COSLoginForm): Promise<RespData> {
        console.log('登录腾讯云COS')
        // 初始化COS对象
        this.cosClient = new COS({
            SecretId: form.secretId,
            SecretKey: form.secretKey,
        })

        this.region = form.region
        this.bucket = form.bucket
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

    // 上传图片
    async uploadImage(file: File, prefix: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.cosClient) throw new Error('cos getFile 存储引擎不存在')
            let extName = file.name.split('.').pop()
            let objectKey = '/images/' + prefix + '/' + generateRandomId() + '.' + extName

            this.cosClient.putObject({
                Bucket: this.bucket,
                Region: this.region,
                Key: objectKey,
                Body: file,
            }, (err, data) => {
                if (err) {
                    console.error('cos上传图片错误：',err)
                    ElNotification.error({title: '系统异常', message: this.errorDispose(err)})
                    reject({status: false, message: this.errorDispose(err)})
                } else {
                    console.log('cos上传图片成功：', data)
                    resolve('https://' + this.bucket + '.cos.' + this.region + '.myqcloud.com' + objectKey)
                }
            });
        })
    }

    // 获取cos文件
    private async getFile(fileName: string): Promise<string> {
        console.log('获取cos文件：', fileName)
        return new Promise((resolve, reject) => {
            if (!this.cosClient) throw new Error('cos getFile 存储引擎不存在')
            this.cosClient.getObject({
                Bucket: this.bucket,
                Region: this.region,
                Key: fileName,
            }, (err, data) => {
                if (data) {
                    this.updateEtag(fileName, data.ETag);
                    resolve(JSON.parse(data.Body.toString()))
                    return
                }

                // 404说明是第一次使用还没初始化，不算异常
                if (err && err.statusCode === 404) {
                    console.log('cos 获取文件404')
                    resolve('')
                } else {
                    console.error('cos 获取文件错误：',err)
                    ElNotification.error({title: '系统异常', message: this.errorDispose(err)})
                    reject({status: false, message: this.errorDispose(err)})
                }
            });
        })
    }

    // 上传cos文件
    private async uploadFile(fileName: string, content: string): Promise<RespData> {
        console.log('上传cos文件：', fileName, content.length)
        return new Promise(async (resolve, reject) => {
            if (!this.cosClient) throw new Error('cos uploadFile 存储引擎不存在')

            // 检查文件是否为最新
            let checkResult = await this.checkEtag(fileName)
            if (!checkResult) {
                console.log('上传cos文件 文件同步异常')
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

            this.cosClient.putObject({
                Bucket: this.bucket,
                Region: this.region,
                Key: fileName,
                Body: JSON.stringify(content),
            }, (err, data) => {
                if (err) {
                    console.error('cos上传文件错误：',err)
                    ElNotification.error({title: '系统异常', message: this.errorDispose(err)})
                    reject({status: false, message: this.errorDispose(err)})
                } else {
                    this.updateEtag(fileName, data.ETag)
                    resolve({status: true})
                }
            });
        })
    }

    // 删除cos文件
    private async deleteFile(fileName: string): Promise<RespData> {
        console.log('删除cos文件：', fileName)
        return new Promise((resolve, reject) => {
            if (!this.cosClient) throw new Error('cos deleteFile 存储引擎不存在')
            this.cosClient.deleteObject({
                Bucket: this.bucket,
                Region: this.region,
                Key: fileName,
            }, (err) => {
                if (err) {
                    console.error('cos删除文件错误：', err)
                    ElNotification.error({title: '系统异常', message: this.errorDispose(err)})
                    reject({status: false, message: this.errorDispose(err)})
                } else {
                    resolve({status: true})
                }
            });
        })
    }

    // 错误提示
    private errorDispose(err: COS.CosError) {

        let errMessageDist: { [key: string]: string } = {
            'CORS blocked or network error': '有可能是存储桶（bucket）不存在、地域（region）错误、跨域配置错误',
            'Access Denied.': '该账号无存储桶（bucket）权限或存储桶错误',
            'Bucket should format as "test-1250000000".': '存储桶（bucket）格式错误',
        }

        if (err) {
            if (err.code === 'InvalidAccessKeyId') {
                return '账户（secretId）无效'
            } else if (err.code === 'SignatureDoesNotMatch') {
                return '密钥（secretKey）无效'
            } else if (err.code === 'Error') {
                let message = errMessageDist[err.message]
                if (message) {
                    return message
                } else {
                    return err.message
                }
            }
        }

        return 'COS登录异常-未知原因'
    }

    // 获取文件标记
    private getEtag(fileName: string): Promise<string> {
        return new Promise(async (resolve) => {
            if (!this.cosClient) throw new Error('cos getEtag 存储引擎不存在')
            this.cosClient.headObject({
                Bucket: this.bucket,
                Region: this.region,
                Key: fileName,
            }, function (err, date) {
                console.error(err)
                resolve(date.ETag)
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
        this.fileEtags[fileName] = etag
    }
}
