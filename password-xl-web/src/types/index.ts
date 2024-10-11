// 密码
import {Ref} from "vue";

// 自定义字段
export interface CustomField {
    key: string;
    val: string;
}

// 密码
export interface Password {
    id: number,
    title: string,
    address: string,
    username: string,
    password: string,
    remark: string,
    addTime: number,
    updateTime: number,
    deleteTime: number,
    favoriteTime: number,
    favorite: boolean,
    customFields: CustomField[],
    labels: Array<number>,
    status: PasswordStatus,
    bgColor: string,
}

// 标签
export interface Label {
    id: number,
    pid: number,
    name: string,
    children: Array<Label>,
}

// 排序规则
export enum Sort {
    ASC = 'ascending',
    DESC = 'descending'
}

// 密码状态
export enum PasswordStatus {
    NORMAL = 0,
    DELETED = 1
}

// 主题
export enum TopicMode {
    AUTO = 'auto',
    LIGHT = 'light',
    DARK = 'dark',
}

// 密码展示方式
export enum PasswordDisplayMode {
    CARD,
    TABLE
}

// 密码生成规则
export interface GenerateRule {
    length: number,// 密码长度
    number: boolean,// 是否使用数字
    lowercase: boolean,// 是否使用小写字母
    uppercase: boolean,// 是否使用大写字母
    symbol: boolean,// 是否使用特殊符号
}

// 设置
export interface Setting {
    sortField: keyof Password, // 排序字段
    sortOrder: Sort,// 排序方向
    showTimeForTable: string,// 在列表中显示时间 no.不显示 addTime.添加时间 updateTime.修改时间
    showLabelForTable: boolean,// 在列表中显示标签
    showStrength: boolean,// 在列表中显示密码强度
    showLabelCard: boolean,// 启用标签模块
    showFavoriteCard: boolean,// 启用收藏模块
    enableShortcutKey: boolean,// 启用快捷键
    enableRecycleBin: boolean,// 启用密码回收站
    verifyShowGesture: boolean,// 验证密码时显示手势
    autoGeneratePassword: boolean,// 添加密码时是否默认自动一次
    generateRule: GenerateRule, // 密码生成规则
    easyConfuseChat: string,// 易混淆字符
    customFields: CustomField[], // 默认自定义字段
    timeoutLock: number, // 超时锁定（秒）
    passwordDisplayMode: PasswordDisplayMode, // 密码展示方式
    autoLogin: boolean,// 记住登录信息
    autoUnlock: boolean,// 记住主密码
    showPasswordStatistics: boolean, // 显示密码统计
    bgColors: Array<string>, // 背景色
    dynamicBackground: boolean, // 动态背景图
    passwordColor: boolean, // 密码颜色
}

// 密码管理器
export interface PasswordManager {

    // 初始化
    login(database: Database): Promise<RespData>,

    // 解锁
    unlock(mainPassword: string): boolean,

    // 锁定
    lock(): void,

    initMainPassword(mainPasswordType: MainPasswordType, mainPassword: string): Promise<RespData>,

    // 添加演示数据
    addDemoData(): void,

    // 验证主密码
    verifyPassword(mainPassword: string, ciphertext?: string): boolean,

    // 修改化主密码
    updateMainPassword(oldMainPassword: string, newMainPasswordType: MainPasswordType, newMainPassword: string): Promise<RespData>,

    // 添加密码
    addPassword(password: Password): Promise<RespData>,

    // 修改密码
    updatePassword(password: Password): Promise<RespData>,

    // 删除密码
    deletePassword(id: number): Promise<RespData>,

    // 彻底删除密码
    completelyDeletePassword(id: number): Promise<RespData>,

    // 取消删除密码
    cancelDeletePassword(id: number): Promise<RespData>,

    // 同步标签数据
    syncStoreData(): Promise<RespData>,

    // 同步密码数据
    syncStoreData(): Promise<RespData>,

    // 同步系统设置
    syncSetting(): Promise<RespData>,

    // 清空回收站
    emptyRecycle(): Promise<RespData>,

    // 获取StoreData
    getStoreData(): StoreData,

    // 注销账号
    closeAccount(): Promise<RespData>,
}

// 数据库
export interface Database {
    login(form: any): Promise<RespData>,

    getStoreData(): Promise<string>,

    setStoreData(text: string): Promise<RespData>,

    deleteStoreData(): Promise<RespData>,

    getSettingData(): Promise<string>,

    setSettingData(text: string): Promise<RespData>,

    deleteSettingData(): Promise<RespData>,
}

// 公用异步响应
export interface RespData {
    status: boolean,
    message?: string,
    content?: string
}

// 服务状态
export enum ServiceStatus {
    NO_LOGIN = '初始化',
    LOGGED = '已登录',
    WAIT_INIT = '待初始化',
    UNLOCKED = '已解锁',
}

// PasswordStore
export interface PasswordStore {
    // 密码管理器
    passwordManager: PasswordManager,
    // 全部密码
    allPasswordArray: Array<Password>,
    // 标签
    labelArray: Array<Label>,
    // 主密码
    mainPassword: string,
    // 服务状态
    serviceStatus: ServiceStatus,
    // 主题
    topicMode: TopicMode,
    // 主密码类型
    mainPasswordType: MainPasswordType,
    // 超时锁
    timeoutLock: any,
    // 加载中动画
    globalLoading: {
        vis: boolean,
        timeout: any,
        content: string
    },
    // 密码列表筛选条件
    filterCondition: {
        // 文字搜索
        searchText: string,
        // 标签搜索
        labelArray: Array<number>,
        // 收藏搜索
        favoriteId: number
    }
}

// RefStore
export interface RefStore {
    // 验证密码组件
    verifyPasswordRef: Ref,
    // 密码表单
    passwordFormRef: Ref,
    // 注销账号
    cancelAccountRef: Ref,
    // 设置
    settingRef: Ref,
    // 标签树
    labelTreeRef: Ref,
    // 标签树外部Div
    labelTreeDivRef: Ref,
    // 设置密码
    setPasswordRef: Ref,
    // 回收站
    recycleBinRef: Ref,
    // 备份与恢复
    backupAndRecoveryRef: Ref,
    // 快速登录提示
    fastLoginRef: Ref,
    // 标签抽屉
    labelDrawer: Ref,
    // 收藏抽屉
    favoriteDrawer: Ref,
    // 新手引导
    tourRef: Ref,
    // 查看密码
    showPasswordRef: Ref,
    // 密码导出
    exportExcelRef: Ref,
    // 密码导入
    importExcelRef: Ref,
    // 右键菜单
    contextmenuRef: Ref,
    // 创建密码按钮
    createPasswordBtnRef: Ref,
    // 密码表单
    passwordFormFormRef: Ref,
    // 密码表单标题录入框
    passwordFormTitleRef: Ref,
    // 密码表单随机按钮
    passwordFormGenerateBtnRef: Ref,
    // 密码表单密码生成规则
    passwordFormGenerateRuleRef: Ref,
    // 密码表单保存按钮
    passwordFormSaveBtnRef: Ref,
    // 密码列表卡片视图
    displayModeCardRef: Ref,
    // 密码列表表格视图
    displayModeTableRef: Ref,
    // 搜索框
    searchInputRef: Ref,
}

// 备份文件格式
export interface BackupFile {
    explain: string,
    storeData: StoreData,
    backupTime: number,
}

// 手势密码-点 区域
export interface GesturePoint {
    id: number,
    x: number,
    y: number,
    radius: number
}

// 手势密码-点
export interface Point {
    x: number,
    y: number
}

// 主密码类型
export enum MainPasswordType {
    STANDARD = 'standard',
    GESTURE = 'gesture',
}

// 登录信息
export interface LoginInfo {
    mainPasswordType: MainPasswordType,
    loginForm: any,
}

// 对象存储登录OSS
export interface OSSLoginForm {
    region: string,
    accessKeyId: string,
    accessKeySecret: string,
    bucket: string,
}

// 私有服务登录Form
export interface PrivateLoginForm {
    serverUrl: string,
    username: string,
    password: string,
}

// 对象存储登录COS
export interface COSLoginForm {
    region: string,
    secretId: string,
    secretKey: string,
    bucket: string,
}

// 密码文件存储对象
export interface StoreData {
    passwordData: string,
    labelData: string,
    mainPasswordType: MainPasswordType,
}



export interface LoginStore {
    // 登录类型
    loginType: string,
    // 登陆中
    logging: boolean,
    // 登录表单
    loginForm: any,
}