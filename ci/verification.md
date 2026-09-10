# 统一发布预验收记录

这是冻结 1.5.0 发布源码前的环境与构建检查记录。最终发布结果以 Jenkins 总入口、两站 Release 中的 `release-manifest.json`、`SHA256SUMS` 和 `publication.json` 为准；预验收产物不会冒充最终提交的产物。

## 已通过的检查

- 35 项契约测试：版本绑定、16 项目标覆盖、附件不可变、摘要校验、补发恢复、失败门禁、latest 保护、worker 精确取消、OSS 备份与上传顺序、Gradle 镜像版本及 SHA256 约束。
- Jenkins 环境验收第 4 次构建：六种镜像及可执行 JAR。四种服务镜像在真实 x86/ARM 环境完成启动、登录、读写删除、图片上传下载、重启持久化；两种 Web 镜像检查静态资源和版本。主源码 `9f54ee69eeb99886abcd524373887f2ec85bd3a0`。
- Jenkins 使用内网 Gradle 9.6.1 分发包、Nexus 依赖源、已有 Gradle PVC。一次分发包下载后，两个 Jib 架构构建分别约 9 秒；没有改变 GitHub 使用的官方分发地址。
- 三个镜像仓库的 28 个新旧名称组合实际推送与读取通过，逐个核对架构和 digest，验收使用 `ci-probe-*` 标签。
- Linux AppImage/RPM/Snap、Windows x64 EXE、macOS Universal DMG 构建、格式、版本、架构、内置页面启动与刷新、IPC 存储通过。源码 `cf8ee11d61a0b0df1c23da6fcbd0d9452d8b8c57`，GitHub Runs：34423049964、34423049742、34423050129。
- GitHub 原生 ARM worker 下载草稿中的共享前端、校验 SHA256、编译及实际运行通过，Run 34337343909。
- GitHub/Gitea 草稿 API 的创建、上传、下载、同摘要复用、不同内容冲突拒绝通过；临时草稿已清理。
- 原 OSS 站点 45 个文件已完整备份并校验，回滚 ID `legacy-fa3ceac54220`；CDN 查询权限已验证可用。
- 五个新 Jenkins 任务和必要插件已配置；旧首页模块及旧任务已移除，独立首页仓库的现有部署保留。

## 正式切换的门禁

一次总入口草稿演练必须覆盖 16 targets、6 images、10 downloads，并验证双站文件摘要一致。随后执行重复运行和部分补发，完成 OSS 上传、CDN 刷新、正式域名访问与回滚检查，再清理旧 Web/Service/Jib 任务和临时验收任务。只有实际通过的目标才允许进入公开 Release 和 latest 更新。

Android 使用已授权的新签名，历史安装无法直接覆盖。CI 必须确认历史签名替换被系统拒绝，再测试新版 online → local → online 覆盖升级保留数据、本地版断网打开和刷新页面。旧版用户先导出数据、卸载重装并导入；新签名文件和密码仅保存在维护者指定目录及 CI Secrets，未提交源码。
