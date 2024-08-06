/**
 * 密码管理器(上接视图,下接存储)
 */
import {Database, Label, MainPasswordType, Password, PasswordManager, PasswordStatus, RespData, ServiceStatus, StoreData} from "@/types";
import {checkPassword, decryptAES, encryptAES} from "@/utils/security.ts";
import {compressArray, decompressionArray} from "@/utils/compress";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useLoginStore} from "@/stores/LoginStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {randomPassword} from "@/utils/global.ts";
import {useRefStore} from "@/stores/RefStore.ts";

export class PasswordManagerImpl implements PasswordManager {

    // 数据库
    private databaseClient: Database | null = null;
    // 原始密码文件
    public storeData: StoreData | null = null
    // 密码状态管理器
    private passwordStore = usePasswordStore()
    // 登录状态管理器
    private loginStore = useLoginStore()
    // 设置状态管理器
    private settingStore = useSettingStore()
    // ref状态管理器
    private refStore = useRefStore()

    // 登录
    async login(database: Database): Promise<RespData> {
        console.log('passwordManager 登录')
        return new Promise(async (resolve, reject) => {
            try {
                let storeDataText = await database.getStoreData()
                let settingDataText = await database.getSettingData()

                // 验证通过初始化基本信息
                if (storeDataText) {
                    this.storeData = JSON.parse(storeDataText);
                    if (this.storeData && this.storeData.mainPasswordType) {
                        this.passwordStore.mainPasswordType = this.storeData.mainPasswordType;
                    }
                }

                if (settingDataText) {
                    console.log('passwordManager 验证通过初始化设置信息')
                    Object.assign(this.settingStore.setting, JSON.parse(settingDataText));
                }

                // 设置存储引擎
                console.log('passwordManager 设置存储引擎')
                this.databaseClient = database

                // 设置密码管理器
                this.passwordStore.passwordManager = this
                console.log('passwordManager 密码管理器初始化成功')

                if (this.storeData && this.storeData.passwordData) {
                    // 密码文件存在-设置服务状态为已登录
                    this.passwordStore.mainPasswordType = this.storeData.mainPasswordType
                    this.passwordStore.setServiceStatus(ServiceStatus.LOGGED);
                } else {
                    // 密码文件不存在-设置服务状态为待初始化
                    this.passwordStore.setServiceStatus(ServiceStatus.WAIT_INIT);
                }
                resolve({status: true})
            } catch (e) {
                reject({status: false, message: e});
            }
        })
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
            nextTick(()=>{
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
            customFields: {},
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

    // 修改主密码
    async updateMainPassword(mainPassword: string, newMainPasswordType: MainPasswordType, newMainPassword: string): Promise<RespData> {
        if (!this.databaseClient) return Promise.reject()
        console.log('passwordManager 修改主密码')
        this.serviceStatusAssert(ServiceStatus.UNLOCKED)

        // 验证旧密码是否正确
        let verifyResult = this.verifyPassword(mainPassword);
        if (!verifyResult) {
            console.log('passwordManager 原密码验证失败，不允许修改')
            return Promise.reject({status: false, message: '旧密码错误'});
        }
        console.log('passwordManager 原密码验证通过')

        this.passwordStore.loading('密码修改中...')

        // 防止修改失败备份密文
        let backStoreData = JSON.stringify(this.storeData);

        this.storeData = {
            passwordData: encryptAES(newMainPassword, JSON.stringify(compressArray(this.passwordStore.allPasswordArray))),
            labelData: encryptAES(newMainPassword, JSON.stringify(this.passwordStore.labelArray)),
            mainPasswordType: newMainPasswordType,
        }

        // 修改密码文件
        let passwordResult = await this.databaseClient.setStoreData(JSON.stringify(this.storeData))
        if (!passwordResult || !passwordResult.status) {
            // 修改失败-回退
            this.storeData = JSON.parse(backStoreData)
            ElNotification.error({title: '系统异常',message: passwordResult.message})
            return Promise.reject()
        }

        // 修改主密码
        this.passwordStore.mainPasswordType = newMainPasswordType
        this.passwordStore.mainPassword = newMainPassword

        // 处理自动登录信息
        this.loginStore.updateRememberLoginInfo(mainPassword, newMainPassword);

        console.log('passwordManager 主密码修改成功')
        this.passwordStore.unloading()
        return Promise.resolve({status: true});
    }

    // 添加密码
    addPassword(password: Password): Promise<RespData> {
        console.log('passwordManager 新增密码：', password);
        this.serviceStatusAssert(ServiceStatus.UNLOCKED);

        const newPassword = {
            ...password,
            id: Date.now(),
            addTime: Date.now(),
            updateTime: Date.now(),
            status: PasswordStatus.NORMAL
        };
        this.passwordStore.allPasswordArray.unshift(newPassword);
        return this.syncStoreData();
    }

    // 修改密码
    updatePassword(password: Password): Promise<RespData> {
        console.log('passwordManager 修改密码：', password.id)
        this.serviceStatusAssert(ServiceStatus.UNLOCKED)
        const index = this.passwordStore.allPasswordArray.findIndex((p: Password) => p.id === password.id);
        if (index !== -1) {
            this.passwordStore.allPasswordArray[index] = password;
            return this.syncStoreData()
        }
        return Promise.reject('没有找到这个密码：' + password.id)
    }

    // 删除密码（移动到回收站）
    deletePassword(id: number): Promise<RespData> {
        console.log('passwordManager 删除密码：', id);
        this.serviceStatusAssert(ServiceStatus.UNLOCKED);
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
        this.serviceStatusAssert(ServiceStatus.UNLOCKED);

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
        this.serviceStatusAssert(ServiceStatus.UNLOCKED);

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

            // 开始恢复
            this.passwordStore.allPasswordArray = decompressionArray(JSON.parse(passwordText))
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
        this.passwordStore.mainPassword = ''
        this.passwordStore.allPasswordArray = []
        this.passwordStore.labelArray = []
        this.passwordStore.setServiceStatus(ServiceStatus.LOGGED)
        localStorage.removeItem('mainPassword')
    }

    // 清空回收站
    emptyRecycle(): Promise<RespData> {
        console.log('passwordManager 清空回收站')
        this.passwordStore.allPasswordArray = this.passwordStore.allPasswordArray.filter(password => password.status !== PasswordStatus.DELETED)
        return this.syncStoreData()
    }

    // 同步设置
    syncSetting(): Promise<RespData> {
        if ([ServiceStatus.NO_LOGIN].includes(this.passwordStore.serviceStatus)) throw new Error('当前状态不允许该操作：' + this.passwordStore.serviceStatus)
        if (!this.databaseClient) throw new Error('系统异常databaseClient isnull syncLabelData')

        return this.databaseClient.setSettingData(JSON.stringify(this.settingStore.setting));
    }

    // 同步数据
    syncStoreData(): Promise<RespData> {
        this.serviceStatusAssert(ServiceStatus.UNLOCKED)
        this.storeData = {
            passwordData: encryptAES(this.passwordStore.mainPassword, JSON.stringify(compressArray(this.passwordStore.allPasswordArray))),
            labelData: encryptAES(this.passwordStore.mainPassword, JSON.stringify(this.passwordStore.labelArray)),
            mainPasswordType: this.passwordStore.mainPasswordType,
        }
        if (!this.databaseClient) throw new Error('系统异常databaseClient isnull syncLabelData')
        return this.databaseClient.setStoreData(JSON.stringify(this.storeData))
    }

    // 获取StoreData
    getStoreData(): StoreData {
        if (this.storeData) {
            return this.storeData;
        }
        throw new Error('文件不存在')
    }

    // 注销账号
    async closeAccount(): Promise<RespData> {
        console.log('passwordManager 注销账号')
        return new Promise(async (resolve) => {
            this.serviceStatusAssert(ServiceStatus.UNLOCKED)
            if (!this.databaseClient) throw new Error('系统异常databaseClient isnull closeAccount')
            // 删除密码与标签文件
            let deleteResult = await this.databaseClient.deleteStoreData().catch((err) => err)
            // 删除设置文件（失败不处理）
            await this.databaseClient.deleteSettingData().catch((err) => err)
            resolve(deleteResult)
        })
    }

    // 服务状态断言
    serviceStatusAssert = (serviceStatus: ServiceStatus) => {
        if (this.passwordStore.serviceStatus !== serviceStatus) {
            throw new Error('当前服务状态不允许该操作：' + this.passwordStore.serviceStatus)
        }
    }
}