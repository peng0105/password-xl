# 官方存储对接发布

账号站为 `https://account.password-xl.cn`，密码网站为 `https://password-xl.cn/`。邮箱及 GitHub 登录成功后，账号站回到 `https://password-xl.cn/#official`；密码网站消费并移除这个无凭据标记，优先连接官方存储，再显示原有主密码解锁或初始化流程。即使已有 OSS 登录缓存，也不会误进旧密码库。主密码不会传给账号服务。

本次提交包含官方存储入口、会话恢复、账号缓存隔离、固定密码/设置文件读写、额度提醒及限制、笔记与图片入口限制，以及对应测试。原有本地、OSS、COS、私有服务入口继续使用各自配置。

## 发布顺序

1. 发布本仓库的 password-xl-web，默认账号 API 地址已经是 `https://account.password-xl.cn`。
2. 发布 password-xl-account 仓库 `codex/official-account` 分支的配套修改。其 k3s ConfigMap 将 `account.vault-origin` 设为 `https://password-xl.cn`，邮箱/GitHub 回跳和“进入我的密码库”按钮指向 `/#official`。

k3s 配置不再从 Secret 的 VAULT_ORIGIN 读取，避免旧本地域名覆盖生产域名。账号站继续使用 `Referrer-Policy: no-referrer`，不要依赖来源头选择存储。两边修改均经独立 Jenkins 任务发布。

发布前确保 account 的 OSS 桶、签名身份及桶 CORS 已配置，允许正式密码网站读取和上传两个固定文件，并暴露 ETag。邮件登录成功不代表 OSS 已就绪；桶配置与攻击验收参考 account 仓库 `deploy/OSS.md`。

## 验证

- `yarn test`、`yarn build`；账号工程另运行 Gradle build、npm build/test。
- 从账号站登录返回首页，确认使用官方存储，仍需原主密码解锁。
- 刷新首页恢复官方会话；选择其他存储后使用原有登录方式。
- 官方模式下验证保存、跨设备冲突、额度限制及退出登录；退出官方账号不清除其他存储的登录缓存。
- 存储尚未配置、网关 HTML 503、网络错误、会话 401 均显示可恢复的状态；失败不回退到旧 OSS 密码库，不循环跳转。
- 官方连接组件只挂载一次；切换前等待旧存储保存完成、清空内存中的旧账号数据与设置，并保留旧存储的登录缓存。麦田图片在桌面和手机均保留。

本地 HTTP 登录代理方案已撤销，不属于此次提交或发布内容。
