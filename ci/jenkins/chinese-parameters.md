# Jenkins 中文参数与配置编码

五个发布任务使用中文参数名，`release.groovy` 在读取时转换为英文内部键，再通过显式 `withEnv` 提供给业务脚本。子任务通过 `string(name: '构建版本', value: ...)` 接收父任务版本，发布开关从父任务归档继承。不要直接在 Shell 中引用中文环境变量。

2026-09-10 排查确认：页面响应为 `text/html;charset=utf-8`，乱码已存在任务配置的 description 中。旧管理脚本提交 UTF-8 XML 时只设置 `Content-Type: application/xml`，Jenkins 请求读取器按 Latin-1 解码。重复保存会重复损坏，任务说明经历了 4～5 次错误转换，参数说明经历了 1～3 次。Web 任务重新执行 `properties()` 后参数说明正常，但任务说明不会被流水线重写。

已在临时、禁用的 Jenkins 任务上复现并比较：

| XML 请求 | 保存后中文一致 |
|---|---|
| UTF-8 字节，未声明 HTTP charset | 否 |
| UTF-8 字节，HTTP `charset=UTF-8` | 是 |
| ASCII XML，非 ASCII 字符写为数字字符引用 | 是 |

配置工具 `migrate_chinese_parameters.py` 同时设置 HTTP charset 和使用 ASCII XML 字符引用。它仅修复可无损还原为中文的 description，并迁移现有参数名称；保留版本默认值、布尔默认值、SCM、凭据引用及构建历史。保存后逐项检查所有 XML 文本，不能只检查参数名。它不会触发产品构建或发布。

环境变量 `JENKINS_URL` 为 Jenkins 地址，`JENKINS_AUTHORIZATION` 为完整 HTTP Authorization 头，通过本机安全环境或 CI 凭据绑定提供，不写入命令行或源码。

```sh
python3 ci/jenkins/migrate_chinese_parameters.py --folder 密码管理
python3 ci/jenkins/migrate_chinese_parameters.py --folder 密码管理 --apply
```

先检查 `.release/jenkins-encoding/migration/report.json`，再执行安装。工具要求五个正式任务都空闲；更新前保存配置备份，修改后读取配置核对文本。默认输出目录被 Git 忽略。不要复用旧参数安装脚本，以免恢复已弃用的英文参数名。

后续 API 请求使用“构建版本、发布OSS、发布Release、推送镜像、同步仓库”作为参数键；布尔值使用真正的 `true` / `false`。现有构建记录保留历史参数，不改写历史记录。
