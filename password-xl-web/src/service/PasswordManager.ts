/**
 * 密码管理器(上接视图,下接存储)
 */
import {
    Database,
    Label,
    MainPasswordType,
    Password,
    PasswordManager,
    PasswordStatus,
    RespData,
    ServiceStatus,
    StoreData,
    TreeNoteData
} from "@/types";
import {checkPassword, decryptAES, encryptAES} from "@/utils/security.ts";
import {compressArray, decompressionArray} from "@/utils/compress";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useLoginStore} from "@/stores/LoginStore.ts";
import {normalizeSetting, useSettingStore} from "@/stores/SettingStore.ts";
import {randomPassword} from "@/utils/global.ts";
import {useRefStore} from "@/stores/RefStore.ts";
import {useNoteStore} from "@/stores/NoteStore.ts";
import {normalizePasswordArray, normalizePasswordFieldOrder} from "@/utils/passwordFieldOrder.ts";
import {toRaw} from "vue";

export class PasswordManagerImpl implements PasswordManager {

    // 原始密码文件
    public storeData: StoreData | null = null
    // 原始笔记树文件
    public treeNoteData: TreeNoteData | null = null
    // 数据库
    private databaseClient: Database | null = null;
    // 密码状态管理器
    private passwordStore = usePasswordStore()
    // 登录状态管理器
    private loginStore = useLoginStore()
    // 设置状态管理器
    private settingStore = useSettingStore()
    // 笔记状态管理器
    private noteStore = useNoteStore()
    // ref状态管理器
    private refStore = useRefStore()

    private nodeCacheMap = new Map<string, string | null>()

    // 同一客户端的所有写入串行执行；失败会使依赖失败快照的后续保存失效。
    private writeQueue: Promise<unknown> = Promise.resolve()
    private pendingWrites = 0
    private storeRevision = 0
    private noteRevision = 0
    private changingMainPassword = false
    private logging = false
    private writeBlocked = false
    private dataRevision = 0

    private isCurrentSession(): boolean {
        return toRaw(this.passwordStore.passwordManager) === toRaw(this)
    }

    private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
        this.pendingWrites++
        const result = this.writeQueue.then(() => {
            if (this.writeBlocked) throw new Error('存储状态尚未确认，请重新登录并检查数据后再修改')
            return operation()
        })
        this.writeQueue = result.catch(() => undefined)
        return result.finally(() => { this.pendingWrites-- })
    }

    private assertWritable(): void {
        this.serviceStatusAssert(ServiceStatus.UNLOCKED)
        if (this.logging) throw new Error('正在切换存储账号，请稍后再操作')
        if (this.changingMainPassword) throw new Error('正在修改主密码，请稍后再操作')
        if (this.writeBlocked) throw new Error('存储状态尚未确认，请重新登录并检查数据后再修改')
    }

    private requireSuccess(result: RespData): void {
        if (result?.status !== true) throw new Error(result?.message || '保存失败，请重试')
    }

    private restoreStoreData(): void {
        if (!this.isCurrentSession() || !this.storeData || this.passwordStore.serviceStatus !== ServiceStatus.UNLOCKED) return
        this.passwordStore.allPasswordArray = normalizePasswordArray(decompressionArray(JSON.parse(
            decryptAES(this.passwordStore.mainPassword, this.storeData.passwordData))))
        this.passwordStore.labelArray = JSON.parse(decryptAES(this.passwordStore.mainPassword, this.storeData.labelData))
    }

    // 登录
    async login(database: Database): Promise<RespData> {
        if (this.changingMainPassword || this.logging) throw new Error('正在处理存储操作，请稍后再登录')
        this.logging = true
        // 旧账号的排队写入必须先结束，才能替换 databaseClient。
        await this.writeQueue
        console.log('passwordManager 登录');
        return new Promise(async (resolve, reject) => {
            try {
                // 同时请求三个数据
                const [storeDataText, settingDataText, noteTreeDataText] = await Promise.all([
                    database.getStoreData(),
                    database.getSettingData(),
                    database.getTreeNoteData()
                ]);

                this.storeData = null
                this.treeNoteData = null
                this.nodeCacheMap.clear()
                this.dataRevision++
                this.writeBlocked = false
                // 验证通过初始化基本信息
                if (storeDataText) {
                    this.storeData = JSON.parse(storeDataText);
                    if (this.storeData && this.storeData.mainPasswordType) {
                        this.passwordStore.mainPasswordType = this.storeData.mainPasswordType;
                    }
                }

                if (settingDataText) {
                    console.log('passwordManager 验证通过初始化设置信息');
                    const savedSetting = JSON.parse(settingDataText);
                    Object.assign(this.settingStore.setting, savedSetting);
                    normalizeSetting(this.settingStore.setting, savedSetting);
                }

                if (noteTreeDataText) {
                    console.log('passwordManager 验证通过初始化笔记信息');
                    this.treeNoteData = JSON.parse(noteTreeDataText);
                }

                // 设置存储引擎
                console.log('passwordManager 设置存储引擎');
                this.databaseClient = database;

                // 设置密码管理器
                this.passwordStore.passwordManager = this;
                console.log('passwordManager 密码管理器初始化成功');

                if (this.storeData && this.storeData.passwordData) {
                    // 密码文件存在-设置服务状态为已登录
                    this.passwordStore.mainPasswordType = this.storeData.mainPasswordType;
                    this.passwordStore.setServiceStatus(ServiceStatus.LOGGED);
                } else {
                    // 密码文件不存在-设置服务状态为待初始化
                    this.passwordStore.setServiceStatus(ServiceStatus.WAIT_INIT);
                }
                resolve({status: true});
            } catch (e) {
                reject({status: false, message: e});
            } finally {
                this.logging = false
            }
        });
    }

    // 初始化密码（第一次使用该系统）
    async initMainPassword(mainPasswordType: MainPasswordType, mainPassword: string): Promise<RespData> {
        console.log('passwordManager 初始化主密码');
        this.serviceStatusAssert(ServiceStatus.WAIT_INIT);
        if (this.passwordStore.mainPassword) throw new Error('密码已存在，不允许初始化');
        if (!this.databaseClient) throw new Error('系统异常');
        console.log('passwordManager 初始化主密码开始');
        try {
            this.passwordStore.mainPassword = mainPassword
            this.storeData = {
                passwordData: encryptAES(mainPassword, JSON.stringify(compressArray([]))),
                labelData: encryptAES(mainPassword, JSON.stringify([])),
                mainPasswordType: mainPasswordType,
            }

            let passwordResult = await this.databaseClient.setStoreData(JSON.stringify(this.storeData));
            if (!passwordResult || !passwordResult.status) {
                return Promise.reject(passwordResult);
            }

            let syncResult = await this.syncSetting()
            if (!syncResult) {
                console.log('passwordManager 同步设置异常')
                return Promise.reject({status: false, message: '设置同步失败'});
            }
            console.log('passwordManager 同步设置成功')
            this.passwordStore.mainPasswordType = mainPasswordType
            // 设置服务状态为已解锁
            console.log('passwordManager login 设置服务状态为已解锁')
            this.passwordStore.setServiceStatus(ServiceStatus.UNLOCKED);
            console.log('passwordManager 主密码初始化成功');
            this.addDemoData()
            await this.syncStoreData()
            nextTick(() => {
                this.refStore.tourRef?.startTour()
            })
            return Promise.resolve({status: true});
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // 添加演示密码
    addDemoData() {
        console.log('passwordManager 添加演示密码')
        let label: Label = {
            id: Date.now(),
            pid: 0,
            name: '网站',
            children: []
        }

        let password: Password = {
            id: Date.now(),
            title: '百度（示例数据）',
            address: 'https://www.baidu.com',
            username: '18395708888',
            password: randomPassword(this.settingStore.setting.generateRule),
            remark: '百度网盘、百度贴吧',
            addTime: Date.now(),
            updateTime: Date.now(),
            deleteTime: 0,
            favoriteTime: 0,
            favorite: true,
            customFields: [],
            labels: [label.id],
            status: PasswordStatus.NORMAL,
            bgColor: ''
        }
        this.passwordStore.labelArray.push(label)
        this.passwordStore.allPasswordArray.push(password)
    }

    // 验证主密码
    verifyPassword(mainPassword: string, ciphertext?: string): boolean {
        try {
            if (ciphertext) {
                return !!decryptAES(mainPassword, ciphertext);
            } else {
                if (!this.storeData) return false
                return !!decryptAES(mainPassword, this.storeData.passwordData);
            }
        } catch (e) {
            return false
        }
    }

    // 修改主密码：先准备密文，存储全部完成后才切换内存主密码。
    async updateMainPassword(mainPassword: string, newMainPasswordType: MainPasswordType, newMainPassword: string): Promise<RespData> {
        this.assertWritable()
        if (!this.databaseClient || !this.storeData) throw new Error('存储引擎未初始化')
        if (!this.verifyPassword(mainPassword)) throw new Error('旧密码错误')
        if (!newMainPassword) throw new Error('新主密码不能为空')
        this.changingMainPassword = true
        this.passwordStore.loading('密码修改中...')
        try {
            return await this.enqueueWrite(async () => {
                const database = this.databaseClient!
                const oldStore = this.storeData!
                const oldTree = this.treeNoteData
                const oldStoreText = await database.getStoreData()
                const oldTreeText = await database.getTreeNoteData()
                // 读取真实原文用于回退，也避免以旧缓存覆盖另一设备已经修改的文件。
                if (JSON.stringify(JSON.parse(oldStoreText)) !== JSON.stringify(oldStore)
                    || JSON.stringify(oldTreeText ? JSON.parse(oldTreeText) : null) !== JSON.stringify(oldTree)) {
                    this.writeBlocked = true
                    throw new Error('存储文件已发生变化，未修改主密码，请重新登录后再操作')
                }
                const oldSettingText = await database.getSettingData()
                const setting = JSON.parse(JSON.stringify(this.settingStore.setting))
                const savedSetting = oldSettingText ? JSON.parse(oldSettingText) : {}
                let newSettingText = oldSettingText
                if ((savedSetting.aiModel?.apiKey || '') !== (setting.aiModel?.apiKey || '')) {
                    throw new Error('AI配置尚未同步，请保存设置后再修改主密码')
                }
                if (setting.aiModel?.apiKey) {
                    const apiKey = decryptAES(mainPassword, setting.aiModel.apiKey)
                    if (!apiKey) throw new Error('AI模型密钥解密失败，未修改主密码，请先检查AI配置')
                    setting.aiModel.apiKey = encryptAES(newMainPassword, apiKey)
                    savedSetting.aiModel.apiKey = setting.aiModel.apiKey
                    newSettingText = JSON.stringify(savedSetting)
                }
                const passwordText = decryptAES(mainPassword, oldStore.passwordData)
                const labelText = decryptAES(mainPassword, oldStore.labelData)
                const noteText = oldTree ? decryptAES(mainPassword, oldTree.noteData) : null
                // 任一密文无法读取时停止，不能把解密失败后的空内容重新加密覆盖。
                JSON.parse(passwordText)
                JSON.parse(labelText)
                if (oldTree) JSON.parse(noteText!)
                // 从最后确认保存的密文重新加密，避免锁定清空明文或未保存草稿影响文件。
                const newStore: StoreData = {
                    passwordData: encryptAES(newMainPassword, passwordText),
                    labelData: encryptAES(newMainPassword, labelText),
                    mainPasswordType: newMainPasswordType,
                }
                const newTree: TreeNoteData | null = oldTree ? {
                    noteData: encryptAES(newMainPassword, noteText!),
                    mainPasswordType: newMainPasswordType,
                } : null

                if (database.setMainPasswordData) {
                    // 浏览器本地模式的原文件已同时包含这两个字段，只需要一次 close 提交。
                    this.requireSuccess(await database.setMainPasswordData(JSON.stringify(newStore), newSettingText))
                } else {
                    const changes: Array<{before: string, after: string, read: () => Promise<string>, write: (text: string) => Promise<RespData>}> = []
                    if (newTree && oldTree) changes.push({before: oldTreeText, after: JSON.stringify(newTree),
                        read: () => database.getTreeNoteData(), write: text => database.setNoteData(text)})
                    if (newSettingText !== oldSettingText) {
                        changes.push({before: oldSettingText, after: newSettingText,
                            read: () => database.getSettingData(), write: text => database.setSettingData(text)})
                    }
                    // 密码库最后提交，前面的文件失败时不会提前改变登录密码。
                    changes.push({before: oldStoreText, after: JSON.stringify(newStore),
                        read: () => database.getStoreData(), write: text => database.setStoreData(text)})
                    const attempted: typeof changes = []
                    try {
                        for (const change of changes) {
                            attempted.push(change)
                            this.requireSuccess(await change.write(change.after))
                        }
                    } catch (error) {
                        let restored = true
                        for (const change of attempted.reverse()) {
                            try {
                                // 请求失败也可能已写入；只回退本次写入的内容，不覆盖未知版本。
                                const current = await change.read()
                                if (current === change.before) continue
                                if (current !== change.after) throw new Error('文件内容已发生其他变化')
                                this.requireSuccess(await change.write(change.before))
                            } catch {
                                restored = false
                            }
                        }
                        if (!restored) {
                            this.writeBlocked = true
                            throw new Error('主密码修改未完成，且无法确认所有文件已恢复。请保留新旧主密码，检查存储连接和备份后重新登录；当前会话已停止写入。')
                        }
                        throw error
                    }
                }
                this.storeData = newStore
                this.treeNoteData = newTree
                if (this.isCurrentSession()) {
                    this.settingStore.setting = setting
                    this.passwordStore.mainPasswordType = newMainPasswordType
                    if (this.passwordStore.serviceStatus === ServiceStatus.UNLOCKED) {
                        this.passwordStore.mainPassword = newMainPassword
                    }
                    this.loginStore.updateRememberLoginInfo(mainPassword, newMainPassword)
                }
                return {status: true}
            })
        } finally {
            this.changingMainPassword = false
            this.passwordStore.unloading()
        }
    }

    // 添加密码
    addPassword(password: Password): Promise<RespData> {
        console.log('passwordManager 新增密码：', password);
        this.assertWritable();

        const newPassword = normalizePasswordFieldOrder({
            ...password,
            id: Date.now(),
            addTime: Date.now(),
            updateTime: Date.now(),
            status: PasswordStatus.NORMAL
        });
        this.passwordStore.allPasswordArray.unshift(newPassword);
        return this.syncStoreData();
    }

    // 修改密码
    updatePassword(password: Password): Promise<RespData> {
        console.log('passwordManager 修改密码：', password.id)
        this.assertWritable()
        normalizePasswordFieldOrder(password)
        const index = this.passwordStore.allPasswordArray.findIndex((p: Password) => p.id === password.id);
        if (index !== -1) {
            this.passwordStore.allPasswordArray[index] = password;
            return this.syncStoreData()
        }
        return Promise.reject('没有找到这个密码：' + password.id)
    }

    // 批量删除密码
    async batchDeletePasswords(ids: number[]): Promise<RespData> {
        console.log('passwordManager 批量删除密码：', ids)
        this.assertWritable()

        const passwordIds = new Set(ids)
        const passwords = this.passwordStore.allPasswordArray.filter(password =>
            passwordIds.has(password.id) && password.status === PasswordStatus.NORMAL
        )
        if (!passwords.length) {
            return {status: true, message: '没有需要删除的密码'}
        }

        if (this.settingStore.setting.enableRecycleBin) {
            const deleteTime = Date.now()
            passwords.forEach(password => {
                password.deleteTime = deleteTime
                password.status = PasswordStatus.DELETED
            })
        } else {
            this.passwordStore.allPasswordArray = this.passwordStore.allPasswordArray.filter(password => !passwordIds.has(password.id))
        }

        return this.syncStoreData()
    }

    // 批量添加密码标签
    async batchAddPasswordLabels(passwordIds: number[], labelIds: number[]): Promise<RespData> {
        console.log('passwordManager 批量添加密码标签：', passwordIds, labelIds)
        this.assertWritable()

        const availableLabelIds = new Set<number>()
        const collectLabelIds = (labels: Label[]) => {
            labels.forEach(label => {
                availableLabelIds.add(label.id)
                collectLabelIds(label.children)
            })
        }
        collectLabelIds(this.passwordStore.labelArray)

        const validLabelIds = Array.from(new Set(labelIds.filter(id => availableLabelIds.has(id))))
        if (!validLabelIds.length) {
            return {status: true, message: '没有需要添加的标签'}
        }

        const passwordIdSet = new Set(passwordIds)
        const updateTime = Date.now()
        let updatedPasswordCount = 0

        this.passwordStore.allPasswordArray.forEach(password => {
            if (!passwordIdSet.has(password.id) || password.status !== PasswordStatus.NORMAL) {
                return
            }
            const passwordLabelIds = new Set(password.labels)
            const originalLabelCount = passwordLabelIds.size
            validLabelIds.forEach(labelId => passwordLabelIds.add(labelId))
            if (passwordLabelIds.size > originalLabelCount) {
                password.labels = Array.from(passwordLabelIds)
                password.updateTime = updateTime
                updatedPasswordCount++
            }
        })

        if (!updatedPasswordCount) {
            return {status: true, message: '所选标签已存在，无需重复添加'}
        }

        const resp = await this.syncStoreData()
        if (resp.status) {
            resp.message = `已为${updatedPasswordCount}个密码添加标签`
        }
        return resp
    }

    // 删除密码（移动到回收站）
    deletePassword(id: number): Promise<RespData> {
        console.log('passwordManager 删除密码：', id);
        this.assertWritable();
        const enableRecycleBin = this.settingStore.setting.enableRecycleBin;
        if (enableRecycleBin) {
            const passwordIndex = this.passwordStore.allPasswordArray.findIndex((password: Password) => password.id === id);
            if (passwordIndex !== -1) {
                let password = this.passwordStore.allPasswordArray[passwordIndex]
                if (password.status === PasswordStatus.DELETED) {
                    return this.completelyDeletePassword(id);
                } else {
                    let deletePassword: Password = this.passwordStore.allPasswordArray[passwordIndex]
                    deletePassword.deleteTime = Date.now()
                    deletePassword.status = PasswordStatus.DELETED
                    return this.syncStoreData();
                }
            } else {
                throw new Error('密码不存在');
            }
        } else {
            return this.completelyDeletePassword(id);
        }
    }

    // 彻底删除密码
    completelyDeletePassword(id: number): Promise<RespData> {
        console.log('passwordManager 彻底删除密码：', id);
        this.assertWritable();

        const index = this.passwordStore.allPasswordArray.findIndex((password: Password) => password.id === id);
        if (index !== -1) {
            this.passwordStore.allPasswordArray.splice(index, 1);
            return this.syncStoreData();
        } else {
            throw new Error('未找到指定ID的密码');
        }
    }

    // 取消删除密码
    cancelDeletePassword(id: number): Promise<RespData> {
        console.log('passwordManager 取消删除密码：', id);
        this.assertWritable();

        const index = this.passwordStore.allPasswordArray.findIndex((password: Password) => password.id === id);
        if (index !== -1) {
            let password = this.passwordStore.allPasswordArray[index];
            password.deleteTime = 0
            password.status = PasswordStatus.NORMAL
            return this.syncStoreData();
        } else {
            throw new Error('未找到指定ID的密码');
        }
    }

    // 解锁密码本
    unlock(mainPassword: string): boolean {
        console.log('passwordManager 准备解锁密码本')
        this.serviceStatusAssert(ServiceStatus.LOGGED)
        if (!this.storeData) throw new Error('系统异常')
        if (this.pendingWrites || this.changingMainPassword) {
            ElMessage.warning('正在完成保存，请稍后解锁')
            return false
        }

        try {
            // 检查当前主密码是否正解锁备份文件
            if (!checkPassword(mainPassword, this.storeData.passwordData)) {
                ElMessage.error('解锁失败-密码错误')
                return false
            }
            let passwordText = decryptAES(mainPassword, this.storeData.passwordData);
            let labelText = decryptAES(mainPassword, this.storeData.labelData);

            if (!passwordText || !labelText) {
                ElMessage.error('解锁失败-密码错误')
                return false
            }

            // 恢复笔记树
            if (this.treeNoteData && this.treeNoteData.noteData) {
                let noteDataText = decryptAES(mainPassword, this.treeNoteData.noteData);
                if (noteDataText) {
                    this.noteStore.noteData = JSON.parse(noteDataText)
                }
            } else {
                this.noteStore.noteData = {noteTree: [], currentNote: ''}
            }

            // 开始恢复
            this.passwordStore.allPasswordArray = normalizePasswordArray(decompressionArray(JSON.parse(passwordText)))
            this.passwordStore.labelArray = JSON.parse(labelText)
            this.passwordStore.mainPassword = mainPassword

            this.passwordStore.setServiceStatus(ServiceStatus.UNLOCKED)
            console.log('密码本已解锁')

            // 设置自动登录信息
            this.loginStore.setAutoLoginInfo(mainPassword)
            return true
        } catch (e) {
            console.log('密码本解锁失败')
            console.error(e)
            return false
        }
    }

    // 锁定密码本
    lock(): void {
        console.log('passwordManager 锁定密码')
        this.passwordStore.resetPrivacyMode()
        this.refStore.showPasswordRef?.closePassword?.()
        this.refStore.passwordFormRef?.closePasswordForm?.()
        this.refStore.settingRef?.closeSetting?.()
        this.nodeCacheMap.clear()
        this.dataRevision++
        this.passwordStore.mainPassword = ''
        this.passwordStore.allPasswordArray = []
        this.passwordStore.labelArray = []
        this.passwordStore.setServiceStatus(ServiceStatus.LOGGED)
        localStorage.removeItem('mainPassword')
    }

    // 清空回收站
    emptyRecycle(): Promise<RespData> {
        console.log('passwordManager 清空回收站')
        this.assertWritable()
        this.passwordStore.allPasswordArray = this.passwordStore.allPasswordArray.filter(password => password.status !== PasswordStatus.DELETED)
        return this.syncStoreData()
    }

    // 同步设置
    async syncSetting(): Promise<RespData> {
        if (this.passwordStore.serviceStatus === ServiceStatus.NO_LOGIN) throw new Error('尚未登录')
        if (this.changingMainPassword || this.logging) return {status: false, message: '正在处理存储操作，请稍后再操作'}
        if (!this.databaseClient) throw new Error('存储引擎未初始化')
        const text = JSON.stringify(this.settingStore.setting)
        return this.enqueueWrite(() => this.databaseClient!.setSettingData(text))
    }

    // 只在存储确认成功后更新密文快照；失败时恢复最后一次成功保存的数据。
    async syncStoreData(): Promise<RespData> {
        try {
            this.assertWritable()
        } catch (error) {
            this.restoreStoreData()
            throw error
        }
        if (!this.databaseClient) throw new Error('存储引擎未初始化')
        normalizePasswordArray(this.passwordStore.allPasswordArray)
        const content: StoreData = {
            passwordData: encryptAES(this.passwordStore.mainPassword, JSON.stringify(compressArray(this.passwordStore.allPasswordArray))),
            labelData: encryptAES(this.passwordStore.mainPassword, JSON.stringify(this.passwordStore.labelArray)),
            mainPasswordType: this.passwordStore.mainPasswordType,
        }
        const revision = this.storeRevision
        return this.enqueueWrite(async () => {
            if (revision !== this.storeRevision) return {status: false, message: '先前保存失败，本次操作未保存，请重新操作'}
            try {
                this.requireSuccess(await this.databaseClient!.setStoreData(JSON.stringify(content)))
                this.storeData = content
                return {status: true}
            } catch (error) {
                this.storeRevision++
                this.restoreStoreData()
                const message = error instanceof Error ? error.message : (error as RespData)?.message || '保存失败，请重试'
                ElNotification.error({title: '保存失败', message})
                return {status: false, message}
            }
        })
    }

    async syncNoteData(): Promise<RespData> {
        this.assertWritable()
        if (!this.databaseClient) throw new Error('存储引擎未初始化')
        const content: TreeNoteData = {
            noteData: encryptAES(this.passwordStore.mainPassword, JSON.stringify(this.noteStore.noteData)),
            mainPasswordType: this.passwordStore.mainPasswordType,
        }
        const revision = this.noteRevision
        return this.enqueueWrite(async () => {
            if (revision !== this.noteRevision) return {status: false, message: '先前目录保存失败，请重新操作'}
            try {
                this.requireSuccess(await this.databaseClient!.setNoteData(JSON.stringify(content)))
                this.treeNoteData = content
                return {status: true}
            } catch (error) {
                this.noteRevision++
                if (this.isCurrentSession() && this.passwordStore.serviceStatus === ServiceStatus.UNLOCKED) {
                    this.noteStore.noteData = this.treeNoteData
                        ? JSON.parse(decryptAES(this.passwordStore.mainPassword, this.treeNoteData.noteData))
                        : {noteTree: [], currentNote: ''}
                }
                const message = error instanceof Error ? error.message : (error as RespData)?.message || '笔记目录保存失败'
                ElNotification.error({title: '保存失败', message})
                return {status: false, message}
            }
        })
    }

    // 获取StoreData
    getStoreData(): StoreData {
        if (this.storeData) {
            return this.storeData;
        }
        throw new Error('文件不存在')
    }

    // 获取treeNoteData
    getTreeNoteData(): TreeNoteData {
        if (this.treeNoteData) {
            return this.treeNoteData;
        }
        throw new Error('文件不存在')
    }

    // 注销账号
    async closeAccount(): Promise<RespData> {
        this.assertWritable()
        if (!this.databaseClient) throw new Error('存储引擎未初始化')
        return this.enqueueWrite(async () => {
            const result = await this.databaseClient!.deleteStoreData()
            if (result.status) await this.databaseClient!.deleteSettingData().catch(() => undefined)
            return result
        })
    }

    // 服务状态断言
    serviceStatusAssert = (serviceStatus: ServiceStatus) => {
        if (this.passwordStore.serviceStatus !== serviceStatus) {
            throw new Error('当前服务状态不允许该操作：' + this.passwordStore.serviceStatus)
        }
    }

    // 等待此前写入；读取过程中发生新写入或锁定时，不再缓存旧读取结果。
    getData = async (name: string): Promise<string> => {
        if (!this.databaseClient) throw new Error('存储引擎未初始化')
        await this.writeQueue
        if (this.nodeCacheMap.has(name)) return this.nodeCacheMap.get(name) || ''
        const revision = this.dataRevision
        const data = await this.databaseClient.getData(name)
        if (revision === this.dataRevision && this.isCurrentSession() && this.passwordStore.serviceStatus === ServiceStatus.UNLOCKED) {
            this.nodeCacheMap.set(name, data)
        }
        return data
    }

    setData = async (name: string, text: string): Promise<RespData> => {
        this.assertWritable()
        if (!this.databaseClient) throw new Error('存储引擎未初始化')
        this.dataRevision++
        return this.enqueueWrite(async () => {
            const result = await this.databaseClient!.setData(name, text)
            if (result?.status === true && this.isCurrentSession() && this.passwordStore.serviceStatus === ServiceStatus.UNLOCKED) {
                this.nodeCacheMap.set(name, text)
            }
            return result
        })
    }

    delData = async (name: string): Promise<RespData> => {
        this.assertWritable()
        if (!this.databaseClient) throw new Error('存储引擎未初始化')
        this.dataRevision++
        return this.enqueueWrite(async () => {
            const result = await this.databaseClient!.deleteData(name)
            if (result?.status === true) this.nodeCacheMap.delete(name)
            return result
        })
    }

    // 删除数据
    uploadImage = (file: File, prefix: string): Promise<any> => {
        if (!this.databaseClient) throw new Error('系统异常databaseClient isnull setData')
        return this.databaseClient.uploadImage(file, prefix)
    }
}
