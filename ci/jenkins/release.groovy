// Loaded by the five thin Jenkinsfiles. Business commands live in ci/release/*.py.
def parameterNames() {
    [VERSION: '构建版本', DEPLOY_OSS: '发布OSS', DEPLOY_KUBERNETES: '发布Kubernets', PUBLISH_RELEASE: '发布Release',
     PUSH_IMAGES: '推送镜像', SYNC_REPOS: '同步仓库']
}

def selectedParameters(selected) {
    def normalized = [:]
    parameterNames().each { key, label ->
        // Old queued/replayed builds may still carry English names. Snapshot before
        // properties() adds new defaults; an explicitly false switch must stay false.
        def value = selected.containsKey(key) ? selected[key] : selected[label]
        if (key == 'VERSION') {
            normalized[key] = value ?: ''
        } else {
            if (value == null) value = !(key in ['DEPLOY_OSS', 'DEPLOY_KUBERNETES'])
            if (!(value instanceof Boolean)) error("${label} 必须是布尔值")
            normalized[key] = value
        }
    }
    return normalized
}

def checkedVersion(value) {
    def version = "${value ?: ''}".trim()
    if (!(version ==~ /(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)/)) {
        error('构建版本必须是 major.minor.patch，例如 1.5.1')
    }
    return version
}

def nextVersion(value) {
    def parts = checkedVersion(value).tokenize('.')
    // Decimal carry avoids both overflow and additional Jenkins sandbox signatures.
    def patch = parts[2]
    def zeros = ''
    while (patch.endsWith('9')) {
        zeros += '0'
        patch = patch.substring(0, patch.length() - 1)
    }
    def incremented = patch ? patch.substring(0, patch.length() - 1) +
        (patch.substring(patch.length() - 1).toInteger() + 1) + zeros : '1' + zeros
    return "${parts[0]}.${parts[1]}.${incremented}"
}

def nextDefaultVersion(selected, initialVersion) {
    def candidate = nextVersion(selected)
    def left = candidate.tokenize('.')
    def right = checkedVersion(initialVersion).tokenize('.')
    for (int i = 0; i < 3; i++) {
        if (left[i].length() != right[i].length()) {
            return left[i].length() > right[i].length() ? candidate : initialVersion
        }
        if (left[i] != right[i]) return left[i].compareTo(right[i]) > 0 ? candidate : initialVersion
    }
    return candidate
}

def configure(String domain, String next = '') {
    def names = parameterNames()
    def definitions = [string(name: names.VERSION, defaultValue: next, trim: true,
        description: '本次构建版本，可修改；更新默认值时取本任务和源码下一版本中较大者，成功后回写 Gitea 源码')]
    if (domain in ['all', 'web']) {
        definitions.add(booleanParam(name: names.DEPLOY_OSS, defaultValue: false, description: '全部成功后用本次 dist 发布 OSS/CDN'))
        definitions.add(booleanParam(name: names.DEPLOY_KUBERNETES, defaultValue: false, description: '全部成功后部署集群 Web；关闭推送镜像时仅上传内网部署所需镜像'))
    }
    definitions.add(booleanParam(name: names.PUBLISH_RELEASE, defaultValue: true, description: '发布 GitHub / Gitea / Gitee 发行版；关闭时产物只归档到 Jenkins'))
    if (domain in ['all', 'web', 'service']) {
        definitions.add(booleanParam(name: names.PUSH_IMAGES, defaultValue: true, description: '推送三个镜像仓库及兼容名称，全部成功后更新 latest'))
    }
    definitions.add(booleanParam(name: names.SYNC_REPOS, defaultValue: true, description: '以 Gitea master 为主，同步代码到 Gitee 和 GitHub master'))
    def settings = [pipelineTriggers([]), buildDiscarder(logRotator(numToKeepStr: '20')), copyArtifactPermission('*')]
    if (definitions) settings.add(parameters(definitions))
    properties(settings)
}

def credentialsFor(config, boolean images, boolean oss, boolean sync = false, boolean privateImage = false) {
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
    if (images || privateImage) {
        (images ? ['private', 'dockerhub', 'tencent'] : ['private']).each { registry ->
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
    if (allFiles) archiveArtifacts artifacts: '.release/repository-sync*.json,.release/version-*.json', allowEmptyArchive: true
    if (allFiles) archiveArtifacts artifacts: '.release/kubernetes-*.json,.release/gitee-*.json', allowEmptyArchive: true
}

def completeRelease(context) {
    // Global promotion lock also serializes *different* versions, preventing latest races.
    lock(resource: 'password-xl-promotion') {
        if (context.deploy_kubernetes) {
            lock(resource: 'password-xl-kubernetes-web') { completeSites(context) }
        } else { completeSites(context) }
    }
}

def completeSites(context) {
        if (context.deploy_oss) {
            lock(resource: 'password-xl-oss-site') { cli('finalize') }
        } else { cli('finalize') }
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
    lock(resource: "password-xl-version-${checkedVersion(env.RELEASE_VERSION)}") {
        cli("prepare --domain ${domain}")
        def context = readJSON(file: '.release/context.json', returnPojo: true)
        currentBuild.displayName = "#${env.BUILD_NUMBER} ${context.version}"
        if (context.sync_repos) {
            stage('同步 Gitee / GitHub 代码') {
                lock(resource: 'password-xl-source-sync') { cli('sync') }
            }
        }
        stage('检查发布配置与版本') { cli('reserve') }
        stage('构建共享前端') { cli('frontend'); archiveReports(false) }
        if (domain == 'all') {
            // Reservations and the frontend exist before children start. Each child owns unique
            // receipts/assets; only the coordinator writes the combined manifest and promotes.
            def branches = [:]
            ['web', 'service', 'desktop', 'android'].each { group ->
                branches[group] = {
                    stage("领域任务 ${group}") {
                        def child = build(job: absoluteJob(config.jobs[group]), wait: true, propagate: true,
                                          parameters: [string(name: parameterNames().VERSION, value: context.version)])
                        copyArtifacts(projectName: absoluteJob(config.jobs[group]), selector: specific("${child.number}"),
                                      filter: '.release/result-*.json,.release/workers/*.json')
                    }
                }
            }
            branches.failFast = true
            parallel branches
        } else { executeDomain(context, domain) }
        stage('汇总并完成发布') { completeRelease(context) }
        stage('回写源码版本') {
            lock(resource: 'password-xl-source-sync') { cli('write-version') }
        }
        if (context.publish_release) {
            stage('同步 Gitee 发行版') { cli('sync-release') }
        }
    }
}

def run(String domain, String podYaml, String initialVersion) {
    def selected = selectedParameters(params)
    def selectedVersion = checkedVersion(selected.VERSION ?: initialVersion)
    configure(domain, nextDefaultVersion(selectedVersion, initialVersion))
    def deployKubernetes = domain in ['all', 'web'] && selected.DEPLOY_KUBERNETES
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
    if (deployKubernetes) {
        // Only tools receives the short-lived deployment token; jnlp/buildkit do not.
        resolvedYaml = deploymentPod(resolvedYaml)
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
                    def actions = actionsFor(parent, inherited, selected)
                    def images = domain in ['all', 'web', 'service'] && actions.PUSH_IMAGES
                    def deploy = !parent && domain in ['all', 'web'] && selected.DEPLOY_OSS
                    variables.addAll(["DEPLOY_OSS=${deploy}"])
                    variables.add("DEPLOY_KUBERNETES=${!parent && deployKubernetes}")
                    variables.add("RELEASE_VERSION=${parent ? checkedVersion(inherited.version) : selectedVersion}")
                    variables.addAll(actions.collect { key, value -> "${key}=${value}" })
                    withEnv(variables) {
                        withCredentials(credentialsFor(config, images, deploy,
                            !parent && (actions.SYNC_REPOS || actions.PUBLISH_RELEASE),
                            domain in ['all', 'web'] && (parent ? inherited.deploy_kubernetes == true : deployKubernetes))) {
                            try {
                                timeout(time: 12, unit: 'HOURS') { releaseBody(domain, config, parent) }
                            } finally {
                                // Jenkins build-step interruption propagates to running children; each cancels its exact Run IDs.
                                def cancelled = sh(script: 'python3 ci/release/release.py cancel', returnStatus: true)
                                archiveReports()
                                if (cancelled != 0) error('Worker cancellation or temporary source cleanup failed; inspect archived reports')
                            }
                        }
                    }
                }
            }
        }
    }
}

def deploymentPod(String yaml) {
    if (!yaml.contains('  volumes:\n') || !yaml.contains('      volumeMounts:\n')) error('Invalid release agent template')
    def metadata = "\nmetadata:\n  labels:\n    password-xl.cn/web-deployer: 'true'\n"
    yaml = yaml.contains('\nmetadata:\n') ? yaml.replace('\nmetadata:\n', metadata) :
        yaml.replace('\nkind: Pod\n', '\nkind: Pod' + metadata)
    return yaml.replace('serviceAccountName: jenkins-build', 'serviceAccountName: password-xl-web-deployer')
        .replaceFirst('      volumeMounts:\n', '''      volumeMounts:
        - name: deployment-api
          mountPath: /var/run/secrets/password-xl
          readOnly: true
''').replace('  volumes:\n', '''  volumes:
    - name: deployment-api
      projected:
        sources:
          - serviceAccountToken:
              path: token
              expirationSeconds: 3600
          - configMap:
              name: kube-root-ca.crt
              items:
                - key: ca.crt
                  path: ca.crt
''')
}

return this
