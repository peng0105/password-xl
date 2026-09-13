# 集群部署与发行版

## Kubernetes

总入口与 Web 任务提供 `发布Kubernets`（内部 `DEPLOY_KUBERNETES`），默认关闭。与 `发布OSS` 独立，可同时开启，不修改 DNS。父任务负责在全部领域成功后部署，子任务不提前更新站点。独立 Web 在四个目标均成功后部署。

| 发布Kubernets | 推送镜像 | 部署行为 |
|---|---|---|
| 关 | 关 | 构建验证与归档 |
| 开 | 关 | 仅将部署所需 Web x86 镜像上传内网 `deploy-版本-源码-摘要` 标签，再按 digest 部署；不更新公开版本标签、旧名称或 latest |
| 开 | 开 | 正常分发三个镜像仓库，再按内网 digest 部署 |

目标固定为 `password-xl/password-xl-web` Deployment 和同名容器。只更新容器镜像及 `password-xl.cn/release` 追踪注解，保留 Service、Ingress、TLS、副本数和资源配置。部署从 Web 结果的 `deployment_image` 读取已验证镜像，禁止使用可变标签。

首次安装执行 `kubectl apply -f k8s/ci/web-deployer.yaml`。专用 SA 只能读取/更新指定 Deployment 和读取本命名空间 Pod；无 Secret、其他 Deployment 或集群级写权限。只有开启部署的总入口/Web Pod 切换 SA，短期 projected token 仅挂载 tools 容器，不挂载 jnlp。Python 使用 Kubernetes HTTPS API，无需 kubectl 或重建工具镜像。

生产命名空间有默认拒绝入站策略，因此清单同时增加受限 NetworkPolicy：仅允许 `jenkins-agent` 命名空间中带 `password-xl.cn/web-deployer=true` 标签的专用部署 Pod 访问 Web TCP 80。其他 Jenkins Pod 不获得此入口，现有 Traefik 规则保持不变。构建前先验证 Service 可达；滚动后的短暂服务路由切换允许最多 30 秒连接重试。

构建前校验权限、Deployment、内网仓库配置。部署锁 `password-xl-kubernetes-web` 内保存旧镜像、实际 Pod digest、Deployment 状态；最多等待 300 秒滚动完成，再校验实际 digest、Service `/healthz`、`/release.json`、HTML 和入口引用资源的字节摘要。失败时使用 resourceVersion 条件更新恢复旧模板；若部署模板已被其他人修改，不覆盖其改动。失败和回滚状态写入 `kubernetes-deployment.json` 并让 Jenkins 失败。

OSS 使用 Bucket 对象回读及摘要核验部署内容，保持 CDN 刷新和等待。Kubernetes 使用集群内 Service 验证。公网域名 `/release.json` 只作为附加诊断记录，DNS 指向另一环境不会误判部署结果。

## 三站发行版

`发布Release` 控制 GitHub、Gitea、Gitee。Gitee 凭据在开启 Release 或分支同步任一动作时绑定。关闭 `同步仓库` 仍会同步发行版所需 Tag 和提交，绝不覆盖冲突 Tag。Gitee 在 GitHub/Gitea 发布和源码版本回写完成后同步；首次仅补齐 1.5.1，不补全部历史版本。

Gitee 新发行版先标为预发布，上传完成并校验后恢复 GitHub 的标题、说明和正式状态。相同附件复用，缺失补传，安装包同名异摘要失败，不静默覆盖。100 MB 以内文件上传原始附件；超限文件按用户选择在说明中提供同版本 GitHub 下载链接、大小与 SHA256。重复同步继续校验已完成记录，平台自动生成的源码归档不参与附件比较。

公开附件只保留可下载产物和 `SHA256SUMS`，不上传 JSON 记录。内部版本绑定、目标收据和发布清单存储于 Gitea Generic Package `password-xl-release-records/版本`，按来源站点隔离；不可变记录发生冲突立即失败。可变清单采用追加修订，按服务器文件 ID 读取最新版本，保留历史。Jenkins 同时归档本次完整报告。应用内部 `/release.json` 不受影响。

旧发行版通过 `python ci/release/clean_release_assets.py --apply` 迁移：逐个转存并读回验证 JSON 后才删除公开附件，更新校验文件和自动生成的说明。需要现有 GitHub/Gitea/Gitee 环境凭据。失败保留进度，可重复运行；随后执行 Gitee 同步更新校验文件。此脚本不删除安装包、不修改源码 Tag。

## 验证

`python -m unittest discover -s ci/tests -p 'test_*.py'` 覆盖五开关的 32 种组合、父任务失败不部署、部署专用镜像只写内网、正常与重复部署、校验失败/超时回滚、并发模板修改保护、Gitee 附件冲突/中断续传/超限链接，以及内部记录迁移失败不删除公开附件。实际 Jenkins Groovy 检查与隔离测试 Deployment 另存于 Jenkins 验收归档；生产验收使用正式 Web 任务。
