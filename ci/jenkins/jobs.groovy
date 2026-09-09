// Optional Job DSL seed. Supply SOURCE_URL and SCM_CREDENTIAL_ID as seed-job parameters.
folder('password-xl')
[
    Release: 'Jenkinsfile', Web: 'password-xl-web/Jenkinsfile', Service: 'password-xl-service/Jenkinsfile',
    Desktop: 'ci/jenkins/Jenkinsfile.desktop', Android: 'ci/jenkins/Jenkinsfile.android'
].each { name, path ->
    pipelineJob("password-xl/${name}") {
        description('Jenkins 统一构建、验证和发布；参数由 Jenkinsfile 首次运行时安装。')
        definition {
            cpsScm {
                scm { git { remote { url(SOURCE_URL); credentials(SCM_CREDENTIAL_ID) }; branch('*/master') } }
                scriptPath(path)
                lightweight(true)
            }
        }
    }
}
