/**
 * WebDAV存储引擎
 */
import axios from "axios";
import {Database, RespData, WebDAVLoginForm} from "@/types";

export class DatabaseForWebDAV implements Database {

    private fileNames = {
        store: 'store.json',
        setting: 'setting.json',
        note: 'password-xl/note.json',
    }

    private serverUrl = ''
    private username = ''
    private password = ''
    private rootPath = ''

    async login(form: WebDAVLoginForm): Promise<RespData> {
        try {
            this.serverUrl = (form.serverUrl || '').trim().replace(/\/+$/, '')
            this.username = form.username
            this.password = form.password
            this.rootPath = this.normalizeRootPath(form.rootPath)

            if (!this.serverUrl) {
                return Promise.resolve({status: false, message: '请输入服务地址'})
            }

            await this.ensureDirectory(this.rootPath)
            await this.ensureDirectory(this.getFullDirPath('password-xl'))
            return Promise.resolve({status: true})
        } catch (e: any) {
            return Promise.resolve({status: false, message: this.errorDispose(e?.message || e + '')})
        }
    }

    async getStoreData(): Promise<string> { return this.getFile(this.fileNames.store) }
    async setStoreData(text: string): Promise<RespData> { return this.uploadFile(this.fileNames.store, text) }
    async getTreeNoteData(): Promise<string> { return this.getFile(this.fileNames.note) }
    async setNoteData(text: string): Promise<RespData> { return this.uploadFile(this.fileNames.note, text) }
    async getData(name: string): Promise<string> { return this.getFile(name) }
    async setData(name: string, text: string): Promise<RespData> { return this.uploadFile(name, text) }
    async deleteStoreData(): Promise<RespData> { return this.deleteFile(this.fileNames.store) }
    async getSettingData(): Promise<string> { return this.getFile(this.fileNames.setting) }
    async setSettingData(text: string): Promise<RespData> { return this.uploadFile(this.fileNames.setting, text) }
    async deleteSettingData(): Promise<RespData> { return this.deleteFile(this.fileNames.setting) }
    async deleteData(fileName: string): Promise<RespData> { return this.deleteFile(fileName) }

    async uploadImage(file: File, prefix: string): Promise<any> {
        const extName = file.name.split('.').pop() || 'png'
        const objectKey = '/images/' + prefix + '/' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.' + extName
        const filePath = this.normalizePath(this.rootPath + objectKey)
        await this.ensureDirectory(this.getDirPath(filePath))
        const arrayBuffer = await file.arrayBuffer()
        await axios.put(this.getAbsoluteUrl(filePath), arrayBuffer, {
            headers: {
                ...this.getAuthHeaders(),
                'Content-Type': file.type || 'application/octet-stream'
            }
        })
        return this.getAbsoluteUrl(filePath)
    }

    private async getFile(fileName: string): Promise<string> {
        try {
            const filePath = this.getFullFilePath(fileName)
            const res = await this.request('GET', this.getAbsoluteUrl(filePath), {responseType: 'text'})
            return (res.data || '') as string
        } catch (e: any) {
            if (e?.status === 404 || e?.response?.status === 404) return ''
            ElNotification.error({title: '系统异常', message: this.errorDispose(e?.message || e + '')})
            return ''
        }
    }

    private async uploadFile(fileName: string, content: string): Promise<RespData> {
        try {
            const filePath = this.getFullFilePath(fileName)
            await this.ensureDirectory(this.getDirPath(filePath))
            await this.request('PUT', this.getAbsoluteUrl(filePath), {
                headers: {'Content-Type': 'application/json;charset=utf-8'},
                data: content
            })
            return {status: true}
        } catch (e: any) {
            const message = this.errorDispose(e?.message || e + '')
            ElNotification.error({title: '系统异常', message})
            return {status: false, message}
        }
    }

    private async deleteFile(fileName: string): Promise<RespData> {
        try {
            const filePath = this.getFullFilePath(fileName)
            await this.request('DELETE', this.getAbsoluteUrl(filePath))
            return {status: true}
        } catch (e: any) {
            if (e?.status === 404 || e?.response?.status === 404) return {status: true}
            const message = this.errorDispose(e?.message || e + '')
            ElNotification.error({title: '系统异常', message})
            return {status: false, message}
        }
    }

    private async ensureDirectory(dirPath: string) {
        const fullPath = this.normalizePath(dirPath)
        if (!fullPath || fullPath === '/') return
        const segments = fullPath.split('/').filter(Boolean)
        let currentPath = ''
        for (const segment of segments) {
            currentPath += '/' + segment
            try {
                await this.request('MKCOL', this.getAbsoluteUrl(currentPath))
            } catch (e: any) {
                if (![400, 405, 409, 301].includes(e?.status || e?.response?.status)) throw e
            }
        }
    }

    private async request(method: string, url: string, options?: {headers?: Record<string, string>, data?: any, responseType?: 'text' | 'arraybuffer'}) {
        const headers = {...this.getAuthHeaders(), ...(options?.headers || {})}
        if (window.electronAPI?.webDavRequest) {
            const result = await window.electronAPI.webDavRequest({
                method,
                url,
                headers,
                data: typeof options?.data === 'string' ? options?.data : undefined,
                responseType: options?.responseType || 'text'
            })
            return result
        }

        const res = await axios({method, url, headers, data: options?.data, responseType: options?.responseType || 'text', transformResponse: [(d) => d]})
        return {status: res.status, data: res.data}
    }

    private getFullFilePath(fileName: string) { return this.normalizePath(this.rootPath + '/' + fileName) }
    private getFullDirPath(path: string) { return this.normalizePath(this.rootPath + '/' + path) }
    private getDirPath(filePath: string) { return filePath.split('/').slice(0, -1).join('/') || '/' }
    private getAbsoluteUrl(pathname: string) { return this.serverUrl + this.normalizePath(pathname) }
    private getAuthHeaders() { return {Authorization: `Basic ${btoa(`${this.username}:${this.password}`)}`} }
    private normalizeRootPath(rootPath?: string) { return (!rootPath || !rootPath.trim()) ? '/password-xl' : this.normalizePath(rootPath) }
    private normalizePath(path: string) { return (path.startsWith('/') ? path : '/' + path).replace(/\/+/g, '/') }
    private errorDispose(err: string) {
        if (err.indexOf('Network Error') !== -1) return '无法连接到WebDAV服务'
        if (err.indexOf('WebDAV request failed') !== -1) return 'WebDAV请求失败，请检查服务地址和权限'
        return err
    }
}
