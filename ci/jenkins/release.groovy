// Loaded by the five thin Jenkinsfiles. Business commands live in ci/release/*.py.
def configure(String domain) {
    def definitions = []
    if (domain in ['all', 'web']) {
        definitions.add(booleanParam(name: 'DEPLOY_OSS', defaultValue: false, description: '全部成功后用本次 dist 发布 OSS/CDN'))
    }
    definitions.add(booleanParam(name: 'PUBLISH_RELEASE', defaultValue: true, description: '发布 GitHub / Gitea Release；关闭时产物只归档到 Jenkins'))
    if (domain in ['all', 'web', 'service']) {
        definitions.add(booleanParam(name: 'PUSH_IMAGES', defaultValue: true, description: '推送三个镜像仓库及兼容名称，全部成功后更新 latest'))
    }
    definitions.add(booleanParam(name: 'SYNC_REPOS', defaultValue: true, description: '以 Gitea master 为主，同步代码到 Gitee 和 GitHub master'))
    def settings = [pipelineTriggers([]), buildDiscarder(logRotator(numToKeepStr: '20')), copyArtifactPermission('*')]
    if (definitions) settings.add(parameters(definitions))
    properties(settings)
}

def credentialsFor(config, boolean images, boolean oss, boolean sync = false) {
    def credentials = [string(credentialsId: config.credentials.github, variable: 'GH_TOKEN'),
                       string(credentialsId: config.credentials.gitea, variable: 'GITEA_TOKEN')]
    if (sync) {
        if (config.credentials.giteeType == 'secretText') {
            credentials.add(string(credentialsId: config.credentials.gitee, variable: 'GITEE_TOKEN'))
        } else {
            credentials.add(usernamePassword(credentialsId: config.credentials.gitee,
                usernameVariable: 'GITEE_USERNAME', passwordVariable: 'GITEE_TOKEN'))
        }
    }
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

def absoluteJob(String name) { name.startsWith('/') ? name : '/' + name }

def actionsFor(parent, inherited, selected) {
    def actions = [:]
    [PUBLISH_RELEASE: 'publish_release', PUSH_IMAGES: 'push_images', SYNC_REPOS: 'sync_repos'].each { key, field ->
        def value = parent ? inherited[field] : (selected.containsKey(key) ? selected[key] : true)
        if (!(value instanceof Boolean)) error("Missing or invalid release switch: ${key}")
        actions[key] = value
    }
    return actions
}

def upstream(String domain, config) {
    // Pipeline's build step uses BuildUpstreamCause, a subclass which the String
    // overload does not include when filtering only hudson.model.Cause$UpstreamCause.
    def causes = currentBuild.getBuildCauses().findAll { it._class in [
        'hudson.model.Cause$UpstreamCause', 'org.jenkinsci.plugins.workflow.support.steps.build.BuildUpstreamCause'] }
    if (!causes) return null
    if (domain == 'all' || causes.size() != 1 || !config.jobs.coordinator ||
        absoluteJob(causes[0].upstreamProject) != absoluteJob(config.jobs.coordinator)) {
        error('Only the configured release coordinator may supply an upstream build context')
    }
    return [job: causes[0].upstreamProject, number: "${causes[0].upstreamBuild}"]
}

def executeDomain(context, domain) {
    stage("构建、验证并发布 ${domain}") { cli("domain --domain ${domain}") }
}

def archiveReports(boolean allFiles = true) {
    archiveArtifacts artifacts: allFiles ? '.release/result-*.json,.release/files/*,.release/metadata/*,.release/publication.json,.release/oss-*.json,.release/workers/*.json' : '.release/context.json,.release/frontend.zip',
        allowEmptyArchive: true, fingerprint: true
    if (allFiles) archiveArtifacts artifacts: '.release/repository-sync.json', allowEmptyArchive: true
}

def completeRelease(context) {
    // Global promotion lock also serializes *different* versions, preventing latest races.
    lock(resource: 'password-xl-promotion') {
        if (context.deploy_oss) {
            lock(resource: 'password-xl-oss-site') { cli('finalize') }
        } else { cli('finalize') }
    }
}

def releaseBody(String domain, config, parent) {
    if (parent) {
        if (!fileExists('.release/context.json')) {
            copyArtifacts(projectName: absoluteJob(parent.job), selector: specific(parent.number),
                          filter: '.release/context.json,.release/frontend.zip')
        }
        cli('checkout')
        def context = readJSON(file: '.release/context.json', returnPojo: true)
        executeDomain(context, domain)
        return
    }
    cli("prepare --domain ${domain}")
    def context = readJSON(file: '.release/context.json', returnPojo: true)
    currentBuild.displayName = "#${env.BUILD_NUMBER} ${context.version}"
    if (context.sync_repos) {
        stage('同步 Gitee / GitHub 代码') {
            lock(resource: 'password-xl-source-sync') { cli('sync') }
        }
    }
    lock(resource: "password-xl-version-${context.version}") {
        stage('检查发布配置与版本') { cli('reserve') }
        stage('构建共享前端') { cli('frontend'); archiveReports(false) }
        if (domain == 'all') {
            // Reservations and the frontend exist before children start. Each child owns unique
            // receipts/assets; only the coordinator writes the combined manifest and promotes.
            def branches = [:]
            ['web', 'service', 'desktop', 'android'].each { group ->
                branches[group] = {
                    stage("领域任务 ${group}") {
                        def child = build(job: absoluteJob(config.jobs[group]), wait: true, propagate: true)
                        copyArtifacts(projectName: absoluteJob(config.jobs[group]), selector: specific("${child.number}"),
                                      filter: '.release/result-*.json,.release/workers/*.json')
                    }
                }
            }
            branches.failFast = true
            parallel branches
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
    if (env.CI_GITEA_INTERNAL_IP?.trim()) {
        def parts = env.CI_GITEA_INTERNAL_IP.tokenize('.')
        if (parts.size() != 4 || parts.any { !(it ==~ /[0-9]{1,3}/) || it.toInteger() > 255 }) {
            error('CI_GITEA_INTERNAL_IP must be the existing ingress Service IPv4 address')
        }
        if (!(env.CI_GITEA_HOST ==~ /[A-Za-z0-9][A-Za-z0-9.-]*/)) error('Set CI_GITEA_HOST to the HTTPS repository hostname')
        // Keep the public URL, certificate verification and ingress policy, while avoiding WAN hairpin upload limits.
        resolvedYaml = resolvedYaml.replace('\nspec:\n', "\nspec:\n  hostAliases:\n    - ip: '${env.CI_GITEA_INTERNAL_IP}'\n      hostnames: ['${env.CI_GITEA_HOST}']\n")
    }
    podTemplate(yaml: resolvedYaml) {
        node(POD_LABEL) {
            container('tools') {
                // Workspace belongs to this ephemeral pod only. No developer checkout is cleaned.
                deleteDir()
                checkout scm
                withCredentials([file(credentialsId: 'password-xl-release-config', variable: 'RELEASE_CONFIG_FILE')]) {
                    def config = readJSON(file: env.RELEASE_CONFIG_FILE, returnPojo: true)
                    def variables = config.environment.collect { key, value -> "${key}=${value}" }
                    def parent = upstream(domain, config)
                    def inherited = [:]
                    if (parent) {
                        copyArtifacts(projectName: absoluteJob(parent.job), selector: specific(parent.number),
                                      filter: '.release/context.json,.release/frontend.zip')
                        inherited = readJSON(file: '.release/context.json', returnPojo: true)
                    }
                    def actions = actionsFor(parent, inherited, params)
                    def images = domain in ['all', 'web', 'service'] && actions.PUSH_IMAGES
                    def deploy = !parent && domain in ['all', 'web'] && (params.DEPLOY_OSS ?: false)
                    variables.addAll(["DEPLOY_OSS=${deploy}"])
                    variables.addAll(actions.collect { key, value -> "${key}=${value}" })
                    withEnv(variables) {
                        withCredentials(credentialsFor(config, images, deploy, !parent && actions.SYNC_REPOS)) {
                            try {
                                timeout(time: 12, unit: 'HOURS') { releaseBody(domain, config, parent) }
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
