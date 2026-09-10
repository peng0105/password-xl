# 发布提速分析与验证

本文保留提速改造时的历史测量；构建参数后来调整为四个独立发布开关，当前规则以 [发布开关](publishing-controls.md) 为准。

## 当前结论

主要耗时来自领域任务和桌面平台串行、重复读取双站 Release、重复下载大附件、重复归档以及镜像跨仓库复制。优化已经接入公共脚本，构建、验证、推送仍在同一次任务中完成。没有增加 k3s 虚拟机、ARM 模拟器或 Windows Agent。

总入口固定读取两个仓库的 master、锁定提交后构建全部 16 项；各领域任务固定构建自身全部目标。当前按 [发布开关](publishing-controls.md) 独立选择 OSS、Release、镜像推送和代码同步，不再提供演练参数。启用推送且全部成功时按版本顺序更新 latest，Release 说明自动生成。

## 耗时基线

以下是 1.5.0 已完成的 Jenkins 运行记录，包含各任务的排队、准备、构建及发布开销。

| 任务 | 首轮构建 | 同版本复用 |
|---|---:|---:|
| 总入口 | #2：72 分 41 秒 | #4：33 分 59 秒 |
| Web | #4：10 分 12 秒 | #7：5 分 52 秒 |
| Service | #2：21 分 23 秒 | #4：7 分 25 秒 |
| Desktop | #2：27 分 13 秒 | #3：10 分 40 秒 |
| Android | #2：9 分 7 秒 | #3：2 分 26 秒 |

以前四个领域依次执行，桌面三个平台也依次执行。改为并行后，总耗时由最慢领域、公共准备和最终发布共同决定，不能把各领域耗时简单相加，也不能据此承诺下一次完整发布的分钟数。

## 已实施的优化

| 环节 | 改动 | 保留的边界 |
|---|---|---|
| 总入口 | Web、Service、Desktop、Android 四任务并行；失败中断兄弟分支 | 共享前端先生成，全部通过才公开 Release、更新 latest 和 OSS |
| 远程编译 | 桌面三平台并行；原生 ARM 提前启动，与 k3s 服务构建重叠 | 每次调度保存唯一 request ID / Run ID；失败或取消清理相关 worker |
| k3s 资源 | 总入口、Desktop、Android 使用轻量 Pod，不启动 BuildKit | Web/Service 保留原编译资源；集群容器上限不改 |
| Gradle | 延续 RustFS 固定版本分发包、Nexus Maven 聚合源、PVC 依赖和构建缓存 | 固定 wrapper SHA256；共享 Gradle 目录继续加文件锁 |
| Yarn | k3s 使用 Nexus npm 聚合源；下载缓存放在现有 PVC 的项目专属目录 | `yarn install --immutable`，不修改锁文件；新工作目录仍安装依赖 |
| 镜像构建 | BuildKit 从内部 `password-xl-build-cache:TARGET` 导入/导出缓存 | 六种正式镜像及兼容标签独立；架构、源码、版本校验保留 |
| GitHub 依赖 | 按系统、架构、任务、依赖锁文件缓存 Yarn、Electron、electron-builder、Gradle | 工作流在 master 调度以便跨版本复用；实际源码仍检出固定 SHA，另外核对工作流 SHA |
| Release 查询 | 同一领域复用 Release 对象、附件列表和已读取 JSON | 不同进程重新读取；汇总阶段重新获取双站收据 |
| 附件恢复 | 优先内部 Gitea；SHA256 文件缓存跨 Pod 复用 | 每次恢复重新计算文件摘要，并核对源码绑定和双方收据 |
| 上传去重 | GitHub 使用服务器 SHA256；Gitea 使用曾下载验证过的附件 ID/UUID 元数据证明 | 首次上传/未知证明需要实际验证；同名不同内容拒绝覆盖 |
| 镜像分发 | 三个仓库并行；兼容名称从同一目的仓库按 digest 复制；已有相同标签直接复用 | 每个名称检查架构、源码、版本、digest，网络错误不冒充“标签不存在” |
| latest | digest 已相同则跳过复制；否则从目的仓库已有版本复制 | 保留更高版本，不回退；最终推广仍有全局锁 |
| 产物传递 | 安装包只在领域任务归档，总入口仅复制结果和 worker 记录；GitHub 上传关闭对已压缩包的再次压缩 | 双站附件和 SHA256SUMS 仍保留；领域 Jenkins 构建保存原始文件 |

附件缓存默认最多 3 GiB，淘汰超过 30 天未使用和超出容量的旧文件。只清理本项目命名的缓存目录，不处理其他项目或 Gradle/Yarn 缓存。缓存缺失、损坏或不可写时回到原始验证/下载路径。私有仓库缓存每个目标只保留一个活动引用；历史无引用层由仓库本身的保留/GC 策略管理。

## 本轮实测

所有测试都没有修改已发布 1.5.0 的 Tag、附件、latest 或正式站点。

### 产物复核

临时 Jenkins 任务 `password-xl-performance-check #3` 使用已验收的 1.5.0 上下文，复核全部 16 项、6 镜像、10 文件。脚本强制禁止 Release 写入、镜像复制、新构建和 worker 调度。

| 指标 | 首次恢复 | 清空工作目录后复用持久缓存 |
|---|---:|---:|
| 四领域顺序复核 | 110.796 秒 | 76.643 秒 |
| Release API GET | 62 | 16 |
| 下载附件字节 | 709,342,564 | 0 |

这是**复核部分**的耗时，包含真实远端镜像检查，不是新版本全量构建耗时，也不能与旧总任务时间直接作百分比比较。

### 内网依赖和镜像缓存

`password-xl-performance-check #4`：Nexus npm + Yarn 首次安装 10.926 秒，同工作目录第二次 0.866 秒；Web 镜像构建 4.263 秒，第二次 1.014 秒。

`#5` 更换为全新 Pod，证明缓存能跨构建复用：Yarn 安装 5.648 秒；BuildKit 从私有仓库导入缓存后构建 2.160 秒，日志确认命中缓存。前后镜像 digest 一致。测试使用已验收 dist，仅写入专用构建缓存引用，没有推送产品版本或 latest。

### Jenkins 协作

`password-xl-flow-check-all #2` 使用实际 Groovy 协调逻辑和本地测试产物，验证四个子任务执行时间确有重叠、通过 Jenkins UpstreamCause 取得父任务上下文、汇总覆盖 16 项。Pipeline 的 `BuildUpstreamCause` 与普通 `UpstreamCause` 均已处理，不再依赖手工传入父任务参数。

本地与 k3s 的 49 项测试覆盖缓存损坏、容量清理、源码冲突、附件内容冲突、并行分发、桌面并行、取消、工作流提交变化和移除参数后的默认行为。

### GitHub worker 缓存

从 Jenkins 显式调用两次 Windows worker，实际源码均为 `a5df16a`，工作流定义为 GitHub master 上的 `4d5d4f5`。两个 SHA 分别校验，均成功生成 EXE，并通过包架构、页面启动/刷新和隔离存储检查。测试文件没有上传到正式 Release。

| 指标 | [首次运行](https://github.com/peng0105/password-xl/actions/runs/34435774119) | [再次运行](https://github.com/peng0105/password-xl/actions/runs/34436066497) |
|---|---:|---:|
| 依赖缓存 | 未命中，成功保存 | 命中，恢复约 74 MB |
| Yarn 下载阶段 | 9.147 秒 | 0.496 秒 |
| Yarn 安装总耗时 | 19.003 秒 | 7.035 秒 |
| Jenkins 调度至收回并校验文件 | 271.555 秒 | 264.634 秒 |

缓存减少依赖下载，但安装包压缩、启动验证、GitHub 排队和收回产物的网络耗时仍存在。本轮 Windows worker 总耗时只减少约 7 秒，不能把依赖安装的改善直接等同于整个任务的改善。macOS、Linux、Android 和原生 ARM 的完整新版本耗时需要在下一次版本发布中继续测量。

正式五个 Jenkins 任务已回读确认参数符合默认规则；六个临时 Jenkins 验证任务均已归档并删除。GitHub 保留成功运行日志及依赖缓存，测试安装包附件在 Jenkins 完成文件校验、保存测试记录后删除，避免与正式下载文件混淆。

## 保留的校验及后续测量

保留新产物的真实架构启动检查、后端登录/读写/重启持久化、APK 签名与升级保留数据、桌面包版本和启动、OSS 完整上传与 CDN 生效验证。这些检查直接防止错误发布，不因提速取消。已经有匹配的验证收据和不可变 digest 时复用结果，避免重建后再测同一份产物。

后续新版本重点记录原生 x86/ARM 编译、GitHub 排队及依赖缓存命中、CDN 生效等待。若主要耗时转移到原生编译，再评估 GraalVM 编译参数和独立缓存容量；若私有仓库积累无引用层，再按仓库维护流程安排 GC。此次不提高现有 Jenkins 容器上限，不扩大所有编译任务的 CPU。

1.5.0 已绑定旧源码；新的源码发布需要先手工增加前端 package.json 版本。CI 改动不覆盖现有发布，也不自动递增业务版本。

参考：[Docker registry 构建缓存](https://docs.docker.com/build/cache/backends/registry/)、[GitHub cache 范围](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)、[GitHub Release API](https://docs.github.com/en/rest/releases/releases)、[Gitea 附件元数据和修改字段](https://github.com/go-gitea/gitea/blob/main/modules/structs/attachment.go)。
