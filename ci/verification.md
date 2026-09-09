# 统一发布验证记录

本文件区分已通过的检查和仍须完成的在线验收。当前首次发布版本为 **1.5.0**，尚未完成全量发布验收。

## 已通过

- 32 项发布契约测试：版本绑定、产物覆盖、不可变附件、摘要校验、补发恢复、失败门禁、latest 保护、worker 精确取消、OSS 首次备份及上传顺序。
- 前端 web、Electron、本地 Android 三种资源构建及 TypeScript 检查。
- 本地可执行 bootJar：启动、登录、包内前端版本、写入读取、重启持久化与删除。
- 本地 Windows x64 NSIS EXE：包格式、版本、架构、内置页面启动和 IPC 文件读写；确认为无正式证书签名。
- Jenkins 已安装并激活 Pipeline Utility Steps、Copy Artifact、Lockable Resources；复用现有 Kubernetes 模板。
- CI 工具镜像在 Jenkins/k3s 构建成功，包含 Node 24、GraalVM 25、Python、Skopeo、BuildKit 和 OSS SDK。
- 原有 OSS 站点完整备份及每个文件摘要验证，45 个文件约 5.5 MB；回滚 ID `legacy-fa3ceac54220`。入口未改动。
- GitHub 已安装仅 workflow_dispatch 的 worker，配置专用 environment、发布 Tag 策略和调度身份检查。

前端/JAR/EXE 的上述本地功能检查最初使用 1.4.4 工作区；1.5.0 固定提交将由在线流水线重新编译验证，不能直接将这些本地包当作正式发布产物。

## 在线验收仍在进行

- 五个领域/协调任务的 Jenkins 实际执行与参数初始化。
- 六种镜像的对应架构运行检查、三个仓库及兼容别名摘要验证。
- Linux 三种桌面包、Universal DMG 的构建及启动检查。
- APK 原签名匹配、两种入口、断网打开和双向覆盖升级数据保留。
- 两站草稿 Release 的 16 项目标/10 个下载文件、重试和部分补发。
- OSS CDN 权限检查、正式部署、访问验证及回滚演练。

未通过的项目不能计为已验收，也不能公开新 Release 或推进 latest/正式站点。
