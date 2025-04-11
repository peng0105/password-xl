/**
 * 阿里云OSS存储引擎
 */
import {Database, RespData} from "@/types";
import OSS from "ali-oss";
import {Buffer} from "buffer";
import {OSSLoginForm} from "@/types/index.ts";

export class DatabaseForOSS implements Database {

    // 文件名称定义
    private fileNames = {
        store: 'password-xl/store.json',
        setting: 'password-xl/setting.json',
    }

    // 文件更新标记（用于检查文件是否在其他客户端更新过，若在其他客户端更新过则强制刷新页面）
    private fileEtags: { [key: string]: string } = {}

    // oss 客户端
    private ossClient: OSS | null = null

    // 登录并验证文件权限、初始化基本信息
    async login(form: OSSLoginForm): Promise<RespData> {
        try {
            // 初始化OSS对象
            this.ossClient = new OSS({
                region: form.region,
                accessKeyId: form.accessKeyId,
                accessKeySecret: form.accessKeySecret,
                bucket: form.bucket,
                secure: true,
            })
            return Promise.resolve({status: true})
        } catch (err) {
            return Promise.reject({status: false, message: err})
        }
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

    // 获取oss文件
    private async getFile(fileName: string): Promise<string> {
        console.log('获取oss文件：', fileName)
        return new Promise((resolve, reject) => {
            if (!this.ossClient) throw new Error('oss getFile 存储引擎不存在')
            this.ossClient.get(fileName).then((response) => {
                // 更新文件标价
                this.updateEtag(fileName, JSON.parse(JSON.stringify(response.res.headers))['last-modified']);
                resolve(response.content.toString())
            }).catch((err: any) => {
                if (err && err.status === 404) {
                    resolve('')
                } else {
                    ElNotification.error({title: '系统异常', message: this.errorDispose(err)})
                    reject({status: false, message: this.errorDispose(err)})
                }
            });
        })
    }

    // 上传oss文件
    private async uploadFile(fileName: string, content: string): Promise<RespData> {
        console.log('上传oss文件：', fileName, 'length:', content.length)
        return new Promise(async (resolve, reject) => {
            if (!this.ossClient) throw new Error('oss uploadFile 存储引擎不存在')

            // 检查文件是否为最新
            let checkResult = await this.checkEtag(fileName)
            if (!checkResult) {
                console.log('上传oss文件 文件同步异常')
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

            let buffer = Buffer.from(content);
            this.ossClient.put(fileName, buffer).then(async () => {
                await this.updateEtag(fileName)
                resolve({status: true})
            }).catch((err) => {
                console.error('oss上传文件错误：', err)
                ElNotification.error({title: '系统异常', message: this.errorDispose(err)})
                reject({status: false, message: this.errorDispose(err)})
            });
        })
    }

    // 删除oss文件
    private async deleteFile(fileName: string): Promise<RespData> {
        console.log('删除oss文件：', fileName)
        return new Promise((resolve, reject) => {
            if (!this.ossClient) throw new Error('oss deleteFile 存储引擎不存在')
            this.ossClient.delete(fileName).then(() => {
                resolve({status: true})
            }).catch((err) => {
                console.error(err)
                ElNotification.error({title: '系统异常', message: this.errorDispose(err)})
                reject({status: false, message: this.errorDispose(err)})
            });
        })
    }

    // 错误提示
    private errorDispose(err: any) {
        let errCodeDist: { [key: string]: string } = {
            'InvalidAccessKeyId': '账号（AccessKeyId）无效',
            'SignatureDoesNotMatch': '密钥（secretKey）无效',
            'AccessDenied': '该账号无存储桶（bucket）权限或存储桶错误',
        }
        if (err.status === -1) {
            console.error('存储桶访问异常：', err)
            return '有可能是存储桶（bucket）不存在、地域（region）错误、跨域配置错误'
        } else if (err.status === 403) {
            let message = errCodeDist[err.code]
            if (message) {
                return message
            } else {
                return '权限错误'
            }
        } else {
            return err.message
        }
    }

    // 获取文件标记
    private getEtag(fileName: string): Promise<string> {
        return new Promise(async (resolve) => {
            if (!this.ossClient) throw new Error('oss getEtag 存储引擎不存在')
            let checkUpdate = await this.ossClient.head(fileName)
            let etag = JSON.parse(JSON.stringify(checkUpdate.res.headers))['last-modified']
            resolve(etag)
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
    private async updateEtag(fileName: string, etag?: string) {
        if (!etag) {
            etag = await this.getEtag(fileName);
        }
        this.fileEtags[fileName] = etag
    }
}
