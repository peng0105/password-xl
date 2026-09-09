# Password XL 统一构建与发布

Jenkins 负责版本、源码、发布和重试；GitHub Actions 只作为显式调度的编译/验证 worker。没有 Windows Agent，也不在 k3s 安装 VM、Docker daemon、QEMU 或 binfmt。官网已迁移至独立 `password-xl-home` 仓库，本仓库不再包含官网模块和部署清单。

## 入口和目标

| Jenkins 任务 | Script Path | TARGETS |
|---|---|---|
| password-xl/Release | `Jenkinsfile` | 以下全部 16 项 |
| password-xl/Web | `password-xl-web/Jenkinsfile` | web-x86, web-arm, dist-zip, dist-tar-gz |
| password-xl/Service | `password-xl-service/Jenkinsfile` | service-x86, service-arm, service-jvm-x86, service-jvm-arm, jar |
| password-xl/Desktop | `ci/jenkins/Jenkinsfile.desktop` | appimage, rpm, snap, dmg, exe |
| password-xl/Android | `ci/jenkins/Jenkinsfile.android` | apk-online, apk-local |

每个领域任务包含构建、验证和发布，可独立运行。总入口按 Web → Service → Desktop → Android 顺序调用本次需要的领域任务；领域内部按运行平台合并 worker，Linux 三种桌面包一次编译，两个 APK 一次签名和升级验证。顺序调度使同一版本的 Release 写入有明确顺序，也减少集群内同时进行原生编译的内存压力。

`PROFILE=all` 构建当前任务全部目标；`PROFILE=custom` 使用固定复选框 `TARGETS`。API 触发时 TARGETS 使用逗号分隔字符串，服务端仍检查允许列表。领域任务只展示自身目标。`SOURCE_REF` 默认 master；APK 任务还接受 `ANDROID_REF`。`UPDATE_LATEST` 默认 true，`DEPLOY_OSS` 默认 false。总入口选择 OSS 时自动构建共享 Web dist，即使本次没有选择 Web 下载包或镜像。

`DRAFT_ONLY=true` 用于演练：仍会同步 Tag、构建、上传草稿附件和三个仓库的版本镜像，生成总清单和校验文件；不公开新 Release、不更新 latest、不部署 OSS。它不是无副作用的 dry-run。已公开的同版本 Release 补发不会重新隐藏旧附件。

`PARENT_JOB/PARENT_BUILD` 是总入口传递固定构建上下文的内部参数，手工运行留空。`RELEASE_NOTES` 是补充说明，不会进入 shell 命令。

## 首次接入

1. 将主仓库的 CI 改动和安卓仓库改动分别审查、提交到 Gitea。需要发布的业务源文件也必须已提交；流水线只读取提交，不读取开发机未提交文件。新版本手工修改前端 package.json；不要复用已经绑定旧 SHA 的版本。
2. 将 `build-workers.yml` 安装到 GitHub 默认分支，关闭旧 `Build Releases.yml` 的自动发布入口。首次注册 workflow 需要它存在于默认分支；之后 Jenkins 推送数字版本 Tag，worker 在该 Tag 对应的精确 SHA 上运行。可以通过正常 PR 合并安装 workflow，无须覆盖任一站点的 master。主仓库代码中已删除旧 push 工作流，并停用了旧 `JenkinsfileJib`，上线时还需在 Jenkins 停用对应旧任务和外部 Webhook 定时触发器。
3. 构建一次 `ci/jenkins/tools.Dockerfile`，推到集群可拉取的内部工具镜像仓库，将固定镜像地址（建议 digest）设置为 Jenkins 全局变量 `CI_TOOLS_IMAGE`。此步骤只初始化 CI 工具镜像，日常产品构建与推送仍在同一个任务内。
4. 安装/确认 Jenkins 插件：Pipeline、Kubernetes、Git、Credentials Binding、Pipeline Utility Steps、Copy Artifact、Lockable Resources、Active Choices。`ci/jenkins/jobs.groovy` 是可选 Job DSL seed；不用 seed 时手工创建上表五个 Pipeline from SCM 即可。seed 的 `SOURCE_URL`、`SCM_CREDENTIAL_ID` 由 Jenkins 参数提供。
5. 将 `ci/jenkins/release-config.example.json` 填写后保存为 Jenkins **Secret file**，ID 固定为 `password-xl-release-config`。示例中的域名/命名空间只是占位值。三个 registry prefix 必须沿用现有任务的值，不带协议；GitHub/Gitea repo 使用 `owner/name`。`jobs` 要与实际任务全名一致。OSS 暂不开启时四个站点配置允许空值。
6. 配置下面的凭据和 GitHub environment，然后首次初始化各任务参数，执行 `Release: PROFILE=all, DRAFT_ONLY=true, DEPLOY_OSS=false`。`ci/verification.md` 记录本地已验证范围；草稿全量演练仍是启用正式入口前的必要验收。

已有 `nodejs-24` 标签仅用于短暂检出 Jenkinsfile 的公共脚本和 Pod 模板；可用 `RELEASE_BOOTSTRAP_LABEL` 改成已有可检出 Git 的标签。真正编译使用临时 k3s Pod，工具容器含 Node 24、Yarn 4.18、Python、GraalVM 25、Skopeo、buildctl 和 OSS SDK。无需再提供 Windows Docker。

工具镜像可在已有的 x86 BuildKit 任务中初始化，例如从仓库根目录执行：

```sh
buildctl build --frontend dockerfile.v0 \
  --local context=. --local dockerfile=ci/jenkins \
  --opt filename=tools.Dockerfile \
  --output type=image,name=YOUR_REGISTRY/password-xl-ci:1,push=true
```

Pod 模板使用 **rootless BuildKit** sidecar、临时 workspace，没有 hostPath 或宿主 Docker socket。其 seccomp/AppArmor 设置限定在该构建 Pod；节点需已允许非特权 user namespace。若当前 k3s 安全策略不接受模板，使用已有允许的 BuildKit Pod 策略调整模板，先验证工具镜像和一次小型 Web 构建；流水线不会修改节点内核或集群策略。默认 tools 内存限制 16Gi、CPU 限制 4，请按实际容量调整 `agent.yaml`。原生构建不能依靠插件替代这些编译资源。

## 凭据与网络

| 所在位置 | 配置 | 用途 |
|---|---|---|
| Jenkins | `password-xl-gitea` Secret text | 读取主仓库/安卓仓库、同步主仓库 Tag、创建 Release 和附件 |
| Jenkins | `password-xl-github` Secret text | 推送 Tag、dispatch/read/cancel Actions、创建 Release 和附件 |
| Jenkins | `password-xl-registry-private` Username/password | 内部候选镜像及正式镜像 |
| Jenkins | `dockerhub-password-xl` Username/password | Docker Hub 发布和默认 Jib 基础镜像认证 |
| Jenkins | `tencent-ccr-password-xl` Username/password | 腾讯云 CCR 发布 |
| Jenkins | `password-xl-oss` Username/password | 用户名为 AccessKey ID，密码为 AccessKey Secret；仅启用 OSS 时注入 |
| Jenkins SCM | 独立 Git Username/password 凭据 | Jenkinsfile 的初始 checkout；不要给 Git 插件传 Secret text 类型 |

上表发布凭据 ID 可在配置文件 `credentials` 中改名。GitHub token 需要 Contents 和 Actions 读写；同步包含 workflow 的提交还需允许修改 workflow（classic PAT 对应 repo/workflow scope）。不把 token 放到 clone URL、调度 payload 或下载文件中。

GitHub 创建 `jenkins-workers` environment，设置允许的发布 Tag 策略。变量：`JENKINS_ACTOR` 为 Jenkins token 对应账号（workflow 会强制核对 actor），`REGISTRY_PRIVATE_PREFIX` 与 Jenkins 一致，`ANDROID_URL` 为安卓 Gitea 仓库 HTTPS 地址。Secrets：

- `REGISTRY_PRIVATE_READ_USERNAME`、`REGISTRY_PRIVATE_READ_PASSWORD`：只读内部候选镜像。
- `GITEA_ANDROID_READ_TOKEN`：只读安卓仓库及签名基线历史提交。
- `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`：现有 Android 签名，不生成替代签名。

GitHub 自带的 `GITHUB_TOKEN` 只授予 contents:read，用于读取本次草稿中的共享前端，不负责对外发布。敏感值只注入需要它们的步骤；worker 上传目录严格限定 `.release/worker/`，签名 key 位于临时目录，注册表认证文件位于 `.release/private/`。

Jenkins 与 GitHub runners 都需要访问依赖仓库；GitHub 还需要通过 HTTPS 读取 Gitea、内部候选镜像仓库和当前服务 Gradle wrapper 的下载地址。代理通过环境配置 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY`，Java 构建自动转换为代理系统属性，仅接受不带嵌入凭据的代理 URL。自建基础镜像可设置 `JVM_BASE_IMAGE`，以及可选 `JVM_BASE_USERNAME/JVM_BASE_PASSWORD`。不要通过日志排查输出完整凭据配置。

## 源码、版本与产物

所有发布以 Gitea 实际提交为准。Jenkins fetch → 固定主仓库 SHA → 读取 package.json 数字版本；需要 APK 时再固定安卓 SHA。数字 Tag 在两站必须指向同一主提交，遇到不同提交立即失败，绝不强推 master 或覆盖 Tag。`release-source.json` 和 `android-source.json` 分别绑定两类源码；首次只发 Web 时不会提前绑定 Android，因此同一主提交可以稍后补齐 APK。绑定后的安卓 SHA 也不能更换。

共享 Web dist 编译一次并打为内部 `frontend.zip`，传给领域任务及 ARM 原生 worker。后端使用 `-PreleaseVersion/-PfrontendDist`；Gradle 显式排除仓库旧 static，再装入本次完整 dist。JAR 是 bootJar，包含 Implementation-Version 和前端 release.json。Electron、Android 使用相对路径模式的前端，每个平台内部复用。

| 类型 | 下载名或新镜像仓库名 |
|---|---|
| Web | password-xl-web-x86、password-xl-web-arm |
| Native Service | password-xl-service-x86、password-xl-service-arm |
| JVM Service | password-xl-service-jvm-x86、password-xl-service-jvm-arm |
| JAR | password-xl-service-VERSION.jar |
| Dist | password-xl-web-dist-VERSION.zip、password-xl-web-dist-VERSION.tar.gz |
| Linux | password-xl-linux-x64-VERSION.AppImage / .rpm / .snap |
| macOS | password-xl-mac-universal-VERSION.dmg |
| Windows | password-xl-win-x64-VERSION.exe |
| Android | password-xl-android-online-VERSION.apk、password-xl-android-local-VERSION.apk |

每个 `-x86` 镜像保留去掉 `-x86` 的旧名称；腾讯云额外保留 `password-xl-service-web` 作为 Web x86 别名。所有名称都有 `:VERSION`，成功后可更新 `:latest`。旧名称始终为 amd64，不改成多架构 manifest。

Skopeo 先将本地 Docker/OCI archive 规范为压缩的单架构 Docker v2 manifest，再选定 canonical digest。镜像推到内部 content-addressed 候选 Tag 后，在真实 x86/ARM GitHub runner 运行检查；之后通过 `--preserve-digests` 分发三个仓库和全部兼容名称。不会通过 `FROM SOURCE_IMAGE` 重新构建。每个目标检查架构、版本/SHA 标签和 digest；版本 Tag 内容冲突立即失败。已有更高版本标签的 latest 不会被低版本补发回退。

原生 x86 在 k3s GraalVM 25 编译；原生 ARM 在 `ubuntu-24.04-arm` 编译，使用 `-march=compatibility`，运行时检查 ELF 架构和 ldd。Jib 在 x86 k3s 中直接生成 amd64/arm64 JVM 镜像，不需要模拟执行。Web 的 ARM 镜像只复制静态文件，也不需要执行 ARM 指令。

桌面采用 x64 NSIS、AppImage/RPM/Snap 和 Universal DMG。Snap 使用 electron-builder 26 的 core22 模板；macOS ad-hoc 签名、无公证；Windows 无正式证书签名。检查包格式、架构、包内版本、打包页面启动和 IPC 存储。DMG 的应用通过 lipo 检查 x86_64+arm64，并执行 codesign/hdiutil 验证。

安卓改动位于独立 `password-xl-android` 仓库。两 flavor 都保留 `com.passwordxl`、getFilesDir 和 INTERNET。联网入口是官方站点；本地入口使用 WebViewAssetLoader 的虚拟 HTTPS origin，从 APK assets 读取相对路径 dist，无需访问该域名服务器，支持 Vite ES modules。原有本地 vault 文件目录保持不变；从旧 file: origin 升级时 WebView localStorage 的页面偏好不会自动迁移，升级测试重点验证原生文件目录数据。版本 code 为 major×1000000+minor×1000+patch，并校验 Android 上限及历史 APK 的升级顺序。

签名基线由安卓仓库 `ci/signing-baseline.json` 记录历史 APK 及当前证书摘要，worker 读取历史 Git blob，通过 apksigner 比较证书。原签名密码遗失，维护者已明确选择在 1.5.0 使用新签名；旧安装需先导出数据，再卸载重装并导入。CI 先验证新签名无法覆盖历史安装，再在隔离模拟器中安装新版、写入测试文件并依次覆盖 online → local → online；local 测试时关闭网络，检测页面、桥接读写和保留数据。SDK/AGP 使用 Android 原版本路线：JDK17、Gradle8.7、AGP8.5.1、SDK34，与服务 Java25 独立。

## 发布、重试和取消

每个目标在验证成功后先保存 `validated-TARGET.json`，完成分发和附件上传后保存不可变 `receipt-TARGET.json`。重试优先读取已有 receipt/checkpoint，验证文件实际 SHA256，修复另一站缺失附件；原始 worker 的附件仅按保存的 Run ID、request ID 恢复。签名文件不会靠重新签名覆盖同名附件。若原 worker 已过期且双站都没有原始字节，需要从 Jenkins 归档恢复原文件；流水线会失败而不会静默替换。

总清单 `release-manifest.json` 汇总同版本之前和本次已完成的目标，含主/安卓 SHA、Jenkins 构建、GitHub Run ID、文件 SHA256、镜像 digest/目的地址；`SHA256SUMS` 包含下载文件和清单摘要。`publication.json` 另行记录公开 Release、latest、OSS 等非原子操作的实际结果。GitHub/Gitea 附件同名不同内容会失败，只有聚合清单、校验文件和发布状态允许更新。

新版本初建为草稿。所选任一领域失败时不执行完成发布阶段，保留已成功上传的版本镜像/草稿附件。全部成功才允许更新所选镜像 latest、可选部署 OSS、公开两个 Release。外部系统没有共同事务；例如第二个 Release 公开失败时第一个可能已公开，任务和 publication.json 会标为失败，重试修复剩余步骤。同版本锁覆盖整个发布，跨版本的 promotion 锁防止 latest 竞争，站点另有 OSS 锁。

Jenkins 在 dispatch 前就记录 request ID，获得 Run ID 后立即落盘；只等待该次运行，核对 workflow SHA、结果身份和文件摘要。取消/超时会请求取消已知 worker；若 dispatch 网络中断导致 Run ID 尚未返回，会按唯一 request ID 查找并取消。Jenkins 基础设施硬故障导致清理无法运行时，需要用归档 request/Run ID 在 GitHub 取消；不能把此类跨系统中断当成已成功取消。

## OSS/CDN 与回滚

启用 `DEPLOY_OSS` 前必须配置 `OSS_BUCKET/OSS_ENDPOINT/OSS_PREFIX/OSS_PUBLIC_URL` 及 OSS/CDN 权限。prefix 的 `/` 明确表示 bucket 根目录；留空不是默认根目录，会提前失败。公开 URL 是 HTTPS 站点根域名；若 bucket 使用子前缀，需要 CDN origin path 对应这个前缀。

流程：将本次 dist 保存至 `_releases/VERSION-SHA12/files/` → 上传并逐个校验资源 → 最后写 HTML → 刷新阿里云 CDN 目录并等待完成 → 从正式域名校验文件摘要 → 更新 `_releases/current.json`。hash 资源长缓存，HTML 和无 hash 文件 no-cache。不会删除旧资源，旧页面仍可引用旧 hash 文件。

回滚使用 Web 任务：`OSS_ROLLBACK=历史 VERSION-SHA12`（首次接入的旧站点为 `legacy-HASH12`）、`DEPLOY_OSS=true`、`DRAFT_ONLY=false`，其他构建选择不生效。回滚只读取已保存版本、恢复、刷新、验证，不重新编译。首次部署自动备份已有站点全部文件，检查备份期间站点未变动，并记录旧站点回滚 ID；每次激活前先验证完整备份摘要。

OSS 和 CDN 可使用同一凭据，也可在配置的 `credentials.cdn` 指定独立 Username/password 凭据。启用部署时会在创建 Release 前检查 OSS 列举和 CDN 刷新查询权限。若内部仓库原本允许匿名访问，可显式配置 `REGISTRY_PRIVATE_ANONYMOUS=true`，同时在 GitHub 设置同名变量，私有仓库凭据不再必填。无版本标签的历史 latest 默认保留；迁移时用 `LEGACY_LATEST_VERSION` 明确其已知版本下限，避免旧版本补发导致回退。

## 验证与验收

本地契约测试：`python -m unittest discover -s ci/tests -v`。前端：`corepack yarn build`。后端：`gradlew build`（流水线加统一版本和 frontendDist）。`ci/release/jar-smoke.py` 可在没有 Docker 的开发机执行 JAR 启动、登录、读写和重启持久化验证。

六种镜像必须在相应真实架构通过 `smoke.py` 才能进入版本分发。Web 检查 nginx、健康页、HTML 和资源；四种后端还执行登录、读写删除、图片上传下载和重启持久化测试。正式验收另需在完整 Web+Service 部署上检查 UI 登录及实际 vault 操作；静态 Web 镜像本身没有后端接口。

首次草稿全量验收应确认：16 targets/6 images/10 downloads；双站附件摘要一致；镜像三个仓库和旧名 digest 一致；同版本重试、部分补发、错误 SHA/同名不同内容失败；取消后无继续运行 worker；Android 原签名/覆盖安装；三平台桌面包实际安装；OSS 测试前缀发布与回滚。通过后关闭 DRAFT_ONLY 切换正式发布。

参考：[GitHub ARM runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[BuildKit rootless](https://github.com/moby/buildkit/blob/master/docs/rootless.md)、[Android 本地资源加载](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)、[CDN 刷新状态 API](https://www.alibabacloud.com/help/en/cdn/developer-reference/api-cdn-2018-05-10-describerefreshtasks)。
