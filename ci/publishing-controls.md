# 构建与发布开关

Gitea 是唯一源码主仓库。构建始终固定读取主仓库和安卓仓库的 master，并锁定实际提交；Gitee 和 GitHub 是主项目的同步仓库。版本由 Jenkins 的 `VERSION` 参数管理，成功后回写主仓库的 `password-xl-web/package.json`。

## 参数

所有五个任务都有可编辑的字符串参数 `VERSION`。各任务默认取该任务上次使用版本的补丁号 +1，例如 `1.5.9 → 1.5.10`；首次安装从已有构建记录初始化，没有记录的新任务从源码版本 +1 初始化。可手工改为 `1.6.0` 等稳定的三段数字版本。运行开始时更新下一次页面默认值，失败也视为用过该版本；重试可手工填回失败版本，同一版本仍不能绑定不同源码。总入口向四个子任务传递相同 VERSION，子任务不再自行加一。

| 参数 | 默认 | 控制范围 |
|---|---|---|
| `DEPLOY_OSS` | false | 全部构建验证通过后，部署 OSS 正式站点并刷新 CDN |
| `PUBLISH_RELEASE` | true | 创建版本 Tag、发布 GitHub/Gitea Release、上传附件与清单 |
| `PUSH_IMAGES` | true | 推送私有仓库、Docker Hub、腾讯云的版本镜像与兼容名称，全部成功后更新 latest |
| `SYNC_REPOS` | true | 将 Gitea 锁定提交同步到 Gitee/GitHub master |

除 VERSION 外，总入口和 Web 展示四个开关；Service 展示 Release、镜像、同步三个；Desktop/Android 展示 Release、同步两个。总入口仍构建全部 16 项，各领域仍构建自身全部目标。子任务从总任务归档继承全部开关和源码，不使用自己的默认值覆盖父任务决定。

关闭某个开关不会关闭构建、架构检查或启动验证，也不会由其他步骤自动重新开启。全关时执行构建和验证，文件、镜像归档与机器可读清单保存在 Jenkins。

版本回写是成功构建的固定步骤，不由四个发布开关控制；全关构建成功也会更新 Gitea 的源码版本。`SYNC_REPOS` 只控制是否进一步同步两个镜像库。

## 构建版本与源码回写

构建前在临时工作目录生成仅修改 package.json 版本的提交，通过独立临时 Gitea ref 供 worker 按 SHA 获取，暂不更新 master。提交的时间和内容固定，因此同一基础源码与 VERSION 的失败重试会生成相同 SHA；Tag、镜像、JAR、桌面包、APK 与内置前端都使用该版本和构建提交。

所有领域构建、验证及所选发布动作成功后，才把版本提交快进或合并到 Gitea master。期间新增的代码、package.json 中的其他改动都会保留；如果已有更高的源码版本，不会降级，仍保留构建提交的可追溯历史。回写只由独立领域任务或总入口执行，子任务不重复提交。源码历史被重写或持续出现推送冲突时明确失败，不强推。

启用同步时，构建前同步原始源码，成功回写后再同步最终 master；关闭同步时仍回写 Gitea。临时 ref 在结束时删除，子任务无权删除父任务的 ref。失败不回写源码版本。回写或同步失败会让 Jenkins 失败，并记录 `version-writeback.json`、`version-ref-cleanup.json` 和 publication.json；已完成的外部发布无法撤销，状态如实记录为部分失败。

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

## 2026-09-10 实测

- 本地 66 项测试通过，包含发布动作组合、同版本跨发布方式的源码冲突、镜像输入摘要、归档路径冲突，以及真实临时 Git 仓库的合并、重复同步和冲突保护。
- 实际 Jenkins Groovy 检查通过：四个领域同时执行，通过 UpstreamCause 读取父任务归档；子任务页面的默认 true 不会覆盖父任务的 false。临时检查任务已归档并删除。
- 正式 [Web 任务 #11](https://jenkins.huangyp.cn/job/%E5%AF%86%E7%A0%81%E7%AE%A1%E7%90%86/job/password-xl-web-release/11/) 成功，源码 `7b63745c1870408b77e40f467892a353731a226e`。设置为 `SYNC_REPOS=true`，其余三项 false；Jenkins 完成 GitHub/Gitee master 同步、Web 双架构镜像、dist ZIP/TAR.GZ 构建和归档，总耗时 6 分 14 秒。
- [x86 worker](https://github.com/peng0105/password-xl/actions/runs/34437902826) 和 [ARM64 worker](https://github.com/peng0105/password-xl/actions/runs/34438048610) 均成功。两者直接检出固定 Gitea SHA，下载校验临时 Docker 归档，检查加载后的 config digest，并在对应真实架构执行启动、健康、内置资源和 nginx 配置检查。
- 从 Jenkins 回读全部四个归档，65,195,155 字节的 SHA256 均与结果清单一致，归档内版本与源码标记正确。两次 worker 的临时输入均已删除；双站 1.5.0 Release 清单和正式站点入口摘要保持原值，发布报告中 Release、镜像、OSS 均为 skipped。

本次重新编译验证的范围是 Web 四个目标，其他领域的安装包验收沿用此前 1.5.0 完整发布记录；参数继承和公共开关逻辑通过本轮专项检查。1.5.0 的已发布源码仍为 `b82d0795f80f47b5850348708950c566842a797b`，后续使用 Jenkins VERSION 选择新版本，不覆盖旧版本的源码绑定。

## VERSION 管理验收

- 77 项本地测试通过，包含相同基础源码与版本生成同一提交、失败不回写、成功快进、并发代码及 package.json 改动保留、较晚完成的旧版本不降级、父子临时 ref 归属及部分失败记录。
- 真实 Jenkins 协调检查分别使用默认 `1.5.1` 和手工输入 `2.0.0`；四个子任务均继承同一版本，后一轮的页面默认值变为 `2.0.1`。检查任务和未使用的沙箱审批请求已清理，没有新增脚本授权。
- [Web #12](https://jenkins.huangyp.cn/job/%E5%AF%86%E7%A0%81%E7%AE%A1%E7%90%86/job/password-xl-web-release/12/) 成功，使用 `1.5.1`、开启 SYNC_REPOS、关闭其余三个发布动作，耗时 6 分 6 秒。[x86](https://github.com/peng0105/password-xl/actions/runs/34439346934) 和 [ARM64](https://github.com/peng0105/password-xl/actions/runs/34439501779) 真实运行验证通过。
- 构建时 master 保持 `1.5.0`，固定构建提交 `7e0bbb70f708e82c8058a41c793a4522aecbac5a` 内为 `1.5.1`；成功后该提交由 Jenkins 写入 Gitea master，并同步到 GitHub/Gitee。临时 ref 已删除，dist 内版本与源码 SHA 核验正确。
- Web 下一次默认 VERSION 为 `1.5.2`；其他四个正式任务上次仍使用 `1.5.0`，因此默认 `1.5.1`。默认值按各任务上次构建计算，总入口启动的子任务始终使用父任务传入值。

本次没有创建 1.5.1 Release、推送版本镜像或部署 OSS，正式站点仍是已发布的 1.5.0。后续在 Jenkins 选择所需版本和发布开关即可，无需手工修改 package.json。
