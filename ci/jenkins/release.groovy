// Loaded by the five thin Jenkinsfiles. Business commands live in ci/release/*.py.
def targetsFor(String domain) {
    def groups = [web: ['web-x86', 'web-arm', 'dist-zip', 'dist-tar-gz'],
        service: ['service-x86', 'service-arm', 'service-jvm-x86', 'service-jvm-arm', 'jar'],
        desktop: ['appimage', 'rpm', 'snap', 'dmg', 'exe'], android: ['apk-online', 'apk-local']]
    return domain == 'all' ? groups.values().flatten() : groups[domain]
}

def configure(String domain) {
    def options = targetsFor(domain).collect { "'${it}'" }.join(',')
    def definitions = [
        string(name: 'SOURCE_REF', defaultValue: 'master', description: 'Gitea 主仓库分支、Tag 或 SHA'),
        choice(name: 'PROFILE', choices: ['all', 'custom'], description: 'all 构建当前任务全部产物'),
        [$class: 'ChoiceParameter', name: 'TARGETS', choiceType: 'PT_CHECKBOX',
         description: 'PROFILE=custom 时生效', filterable: false, randomName: "targets-${domain}",
         script: [$class: 'GroovyScript', script: [sandbox: true, classpath: [], script: "return [${options}]"],
                  fallbackScript: [sandbox: true, classpath: [], script: 'return []']]],
        booleanParam(name: 'UPDATE_LATEST', defaultValue: true, description: '所有所选目标成功后更新相关 latest；不回退新版本'),
        booleanParam(name: 'DRAFT_ONLY', defaultValue: false, description: '演练：上传版本镜像及草稿附件，跳过公开 Release、latest、OSS'),
        text(name: 'RELEASE_NOTES', defaultValue: '', description: '补充说明；自动附上版本、源码和产物清单'),
        string(name: 'PARENT_JOB', defaultValue: '', description: '内部协调参数，手工构建留空'),
        string(name: 'PARENT_BUILD', defaultValue: '', description: '内部协调参数，手工构建留空')]
    if (domain in ['all', 'android']) {
        definitions.add(string(name: 'ANDROID_REF', defaultValue: 'master', description: 'Gitea 安卓仓库分支、Tag 或 SHA'))
    }
    if (domain in ['all', 'web']) {
        definitions.add(booleanParam(name: 'DEPLOY_OSS', defaultValue: false, description: '全部成功后用本次 dist 发布 OSS/CDN'))
    }
    if (domain == 'web') {
        definitions.add(string(name: 'OSS_ROLLBACK', defaultValue: '',
            description: '仅回滚 OSS：填历史部署 ID，例如 1.5.0-abcdef012345，同时勾选 DEPLOY_OSS；不重新编译'))
    }
    properties([parameters(definitions), pipelineTriggers([]), buildDiscarder(logRotator(numToKeepStr: '20')),
                copyArtifactPermission('*')])
}

def credentialsFor(config, boolean images, boolean oss) {
    def credentials = [string(credentialsId: config.credentials.github, variable: 'GH_TOKEN'),
                       string(credentialsId: config.credentials.gitea, variable: 'GITEA_TOKEN')]
    if (images) {
        ['private', 'dockerhub', 'tencent'].each { registry ->
            if (registry != 'private' || config.environment.REGISTRY_PRIVATE_ANONYMOUS != 'true') {
                credentials.add(usernamePassword(credentialsId: config.credentials[registry],
                usernameVariable: "REGISTRY_${registry.toUpperCase()}_USERNAME",
                passwordVariable: "REGISTRY_${registry.toUpperCase()}_PASSWORD"))
            }
        }
    }
    if (oss) {
        credentials.add(usernamePassword(credentialsId: config.credentials.oss,
            usernameVariable: 'OSS_ACCESS_KEY_ID', passwordVariable: 'OSS_ACCESS_KEY_SECRET'))
        if (config.credentials.cdn) {
            credentials.add(usernamePassword(credentialsId: config.credentials.cdn,
                usernameVariable: 'CDN_ACCESS_KEY_ID', passwordVariable: 'CDN_ACCESS_KEY_SECRET'))
        }
    }
    return credentials
}

def cli(String command) { sh "python3 ci/release/release.py ${command}" }

def executeDomain(context, domain) {
    stage("构建、验证并发布 ${domain}") { cli("domain --domain ${domain}") }
}

def archiveReports(boolean allFiles = true) {
    archiveArtifacts artifacts: allFiles ? '.release/result-*.json,.release/files/*,.release/metadata/*,.release/publication.json,.release/oss-*.json,.release/workers/*.json' : '.release/context.json,.release/frontend.zip',
        allowEmptyArchive: true, fingerprint: true
}

def completeRelease(context) {
    if (params.DRAFT_ONLY) {
        cli('draft')
        echo '草稿演练完成：保留版本产物，跳过公开 Release、latest 和 OSS。'
        return
    }
    // Global promotion lock also serializes *different* versions, preventing latest races.
    lock(resource: 'password-xl-promotion') {
        if (context.deploy_oss) {
            lock(resource: 'password-xl-oss-site') { cli('finalize') }
        } else { cli('finalize') }
    }
}

def releaseBody(String domain, config, boolean managed) {
    if (domain == 'web' && params.OSS_ROLLBACK?.trim()) {
        if (!params.DEPLOY_OSS || managed || params.DRAFT_ONLY) error('OSS 回滚要求 DEPLOY_OSS=true、DRAFT_ONLY=false，且独立运行 Web 任务')
        if (!(params.OSS_ROLLBACK ==~ /(?:[0-9]+\.[0-9]+\.[0-9]+|legacy)-[0-9a-f]{12}/)) error('Invalid OSS deployment ID')
        stage('回滚 OSS/CDN') {
            lock(resource: 'password-xl-oss-site') { cli("rollback-oss --deployment ${params.OSS_ROLLBACK}") }
        }
        return
    }
    if (managed) {
        if (!(params.PARENT_BUILD ==~ /[1-9][0-9]*/)) error('Invalid parent build number')
        copyArtifacts(projectName: params.PARENT_JOB, selector: specific(params.PARENT_BUILD),
                      filter: '.release/context.json,.release/frontend.zip')
        cli('checkout')
        def context = readJSON(file: '.release/context.json', returnPojo: true)
        executeDomain(context, domain)
        return
    }
    cli("prepare --domain ${domain}")
    def context = readJSON(file: '.release/context.json', returnPojo: true)
    currentBuild.displayName = "#${env.BUILD_NUMBER} ${context.version}"
    lock(resource: "password-xl-version-${context.version}") {
        stage('锁定双站版本') { cli('reserve') }
        stage('构建共享前端') { cli('frontend'); archiveReports(false) }
        if (domain == 'all') {
            // Sequential children keep per-version release writes ordered; each child owns build + publish.
            ['web', 'service', 'desktop', 'android'].each { group ->
                if (context.targets.any { targetsFor(group).contains(it) }) {
                    stage("领域任务 ${group}") {
                        def child = build(job: config.jobs[group], wait: true, propagate: true, parameters: [
                            string(name: 'PARENT_JOB', value: env.JOB_NAME),
                            string(name: 'PARENT_BUILD', value: env.BUILD_NUMBER),
                            string(name: 'SOURCE_REF', value: context.source_sha),
                            string(name: 'PROFILE', value: 'custom'),
                            string(name: 'TARGETS', value: context.targets.findAll { targetsFor(group).contains(it) }.join(',')),
                            booleanParam(name: 'UPDATE_LATEST', value: false),
                            booleanParam(name: 'DRAFT_ONLY', value: params.DRAFT_ONLY)])
                        copyArtifacts(projectName: config.jobs[group], selector: specific("${child.number}"),
                                      filter: '.release/result-*.json,.release/files/*,.release/workers/*.json')
                    }
                }
            }
        } else { executeDomain(context, domain) }
        stage('汇总并完成发布') { completeRelease(context) }
    }
}

def run(String domain, String podYaml) {
    configure(domain)
    if (!env.CI_TOOLS_IMAGE) error('Set Jenkins CI_TOOLS_IMAGE to the image built from ci/jenkins/tools.Dockerfile')
    def resolvedYaml = podYaml.replace('${CI_TOOLS_IMAGE}', env.CI_TOOLS_IMAGE)
        .replace('${CI_AGENT_IMAGE}', env.CI_AGENT_IMAGE ?: 'jenkins/inbound-agent:jdk21')
        .replace('${CI_BUILDKIT_IMAGE}', env.CI_BUILDKIT_IMAGE ?: 'moby/buildkit:v0.23.2-rootless')
        .replace('${CI_GRADLE_CACHE_CLAIM}', env.CI_GRADLE_CACHE_CLAIM ?: 'gradle-build-cache-pvc')
    podTemplate(yaml: resolvedYaml) {
        node(POD_LABEL) {
            container('tools') {
                // Workspace belongs to this ephemeral pod only. No developer checkout is cleaned.
                deleteDir()
                checkout scm
                withCredentials([file(credentialsId: 'password-xl-release-config', variable: 'RELEASE_CONFIG_FILE')]) {
                    def config = readJSON(file: env.RELEASE_CONFIG_FILE, returnPojo: true)
                    def variables = config.environment.collect { key, value -> "${key}=${value}" }
                    def managed = params.PARENT_JOB?.trim() as boolean
                    def chosen = params.PROFILE == 'custom' ? (params.TARGETS ?: '').tokenize(',') : targetsFor(domain)
                    def images = chosen.any { it.startsWith('web-') || it.startsWith('service-') }
                    variables.addAll(["SOURCE_REF=${params.SOURCE_REF ?: 'master'}", "ANDROID_REF=${params.ANDROID_REF ?: 'master'}",
                        "PROFILE=${params.PROFILE ?: 'all'}", "TARGETS=${params.TARGETS ?: ''}",
                        "UPDATE_LATEST=${params.UPDATE_LATEST == null ? true : params.UPDATE_LATEST}", "DEPLOY_OSS=${params.DEPLOY_OSS ?: false}",
                        "RELEASE_NOTES=${params.RELEASE_NOTES ?: ''}"])
                    withEnv(variables) {
                        withCredentials(credentialsFor(config, images, params.DEPLOY_OSS ?: false)) {
                            try {
                                timeout(time: 12, unit: 'HOURS') { releaseBody(domain, config, managed) }
                            } finally {
                                // Jenkins build-step interruption propagates to running children; each cancels its exact Run IDs.
                                def cancelled = sh(script: 'python3 ci/release/release.py cancel', returnStatus: true)
                                archiveReports()
                                if (cancelled != 0) error('GitHub worker cancellation failed; inspect archived Run IDs')
                            }
                        }
                    }
                }
            }
        }
    }
}

return this
