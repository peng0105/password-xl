# 构建与发布开关

Gitea 是唯一源码主仓库。构建始终固定读取主仓库和安卓仓库的 master，并锁定实际提交；Gitee 和 GitHub 是主项目的同步仓库。版本取自锁定提交的前端 package.json，不自动修改业务版本。

## 参数

| 参数 | 默认 | 控制范围 |
|---|---|---|
| `DEPLOY_OSS` | false | 全部构建验证通过后，部署 OSS 正式站点并刷新 CDN |
| `PUBLISH_RELEASE` | true | 创建版本 Tag、发布 GitHub/Gitea Release、上传附件与清单 |
| `PUSH_IMAGES` | true | 推送私有仓库、Docker Hub、腾讯云的版本镜像与兼容名称，全部成功后更新 latest |
| `SYNC_REPOS` | true | 将 Gitea 锁定提交同步到 Gitee/GitHub master |

总入口和 Web 展示四项；Service 展示 Release、镜像、同步三项；Desktop/Android 展示 Release、同步两项。总入口仍构建全部 16 项，各领域仍构建自身全部目标。子任务从总任务归档继承全部开关和源码，不使用自己的默认值覆盖父任务决定。

关闭某个开关不会关闭构建、架构检查或启动验证，也不会由其他步骤自动重新开启。全关时执行构建和验证，文件、镜像归档与机器可读清单保存在 Jenkins。

| 用途 | OSS | Release | 镜像 | 同步 |
|---|---|---|---|---|
| 仅构建验证 | 关 | 关 | 关 | 关 |
| 构建并同步代码 | 关 | 关 | 关 | 开 |
| 仅更新正式站点 | 开 | 关 | 关 | 按需 |
| 仅发布下载文件 | 关 | 开 | 关 | 按需 |
| 仅发布镜像 | 关 | 关 | 开 | 按需 |
| 完整发布 | 开 | 开 | 开 | 开 |

这里“仅”指发布动作；任务仍构建自身全部目标。代码同步在构建前完成，编译失败不会自动撤销已同步代码。Release、latest、OSS 的最终公开/更新仍要求本次全部目标验证成功；已上传的版本镜像和草稿保留用于重试。

## 仓库同步

`SYNC_REPOS` 控制 master 分支同步，不控制 Release 的版本 Tag。发布 Release 必须使版本 Tag 指向实际源码，因此即使不更新 master，`PUBLISH_RELEASE=true` 也会同步该 Tag 及其所需提交到 GitHub/Gitea。

同步顺序为 Gitea → GitHub、Gitee，不把同步库内容反向写入主仓库。以正常快进或合并保留目标库历史，不强推、不删除分支；目标存在冲突时失败并保存同步报告，不擅自丢弃改动。同步后确认镜像库包含锁定提交；若目标保留自身 README/合并历史，其 master SHA 可以不同。产物源码始终使用原 Gitea SHA。

安卓源码继续直接从其 Gitea 仓库检出固定 SHA；不会擅自创建公开安卓同步仓库。Gitee 只用于代码同步，Release 仍发布到 GitHub 和 Gitea 两站。

## 独立开关所需的构建传输

GitHub worker 先检出固定版本的工作流工具，再直接从 Gitea 获取锁定的源码 SHA，所以关闭仓库同步也能构建尚未同步到 GitHub 的提交。

共享前端及不推送镜像时的验证输入，暂存于 Gitea Generic Package 的 `password-xl-ci-input/随机请求ID`。这不是 Release 附件、Git 分支或镜像仓库标签。worker 下载后验证长度和 SHA256；完成或取消时删除该请求的临时包，失败记录保留 request/Run ID 供清理追踪。该传输不改变 OSS 站点。

`PUSH_IMAGES=false` 时不写入任何镜像仓库标签，也不导出 BuildKit 远程缓存；允许读取已有构建缓存和基础镜像。镜像在 Jenkins 保存为 `password-xl-image-TARGET-VERSION.zip`，包含规范化 manifest 和镜像层。送往真实架构 runner 验证时，另导出 Docker archive，并验证加载后的 image config digest，以确认配置和 rootfs 与 Jenkins 构建一致。

`PUBLISH_RELEASE=true, PUSH_IMAGES=false` 时可上传镜像构建归档作为内部附件，清单记录镜像已验证但无推送地址；不虚构镜像发布收据。以后同源码版本启用推送时可恢复相同归档，再生成正式镜像发布收据。

仅推送镜像时，Gitea Generic Package 的 `password-xl-image-state/版本` 保存少量不可变源码绑定和镜像验证/分发收据，供失败重试使用，不创建 Git Release。版本已绑定不同源码时拒绝发布，防止同一版本的不同镜像来自不同提交。版本镜像和旧名称仍按 digest 校验，latest 不回退到较旧版本。

## 配置与验证

Jenkins 配置增加 `GITEE_URL`、`GITEE_USERNAME` 和凭据 `password-xl-gitee`。凭据可为用户名/密码；如果使用 Secret text，在 `credentials.giteeType` 指定 `secretText`。关闭 `SYNC_REPOS` 时不要求绑定该凭据。

GitHub worker 配置 `GITEA_SOURCE_URL`、`GITEA_URL`、`GITEA_REPO`，并将能读取主仓库、安卓仓库和构建输入的现有 Gitea 凭据放入 environment secret `GITEA_BUILD_READ_TOKEN`。原生 ARM 不再需要读取草稿 Release，其 GitHub token 已降为 contents:read。

控制测试覆盖四开关全部 16 种组合、关闭时无相应外部调用、版本冲突、临时输入校验和上传失败清理。实际运行结果另见 Jenkins 归档的 `publication.json`、`repository-sync.json` 和 worker 记录；关闭的动作明确记录为 skipped。
