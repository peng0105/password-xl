// Run with: groovy ci/tests/jenkins-version.groovy (repository root).
def flow = new GroovyShell().parse(new File('ci/jenkins/release.groovy'))
assert flow.nextDefaultVersion('1.5.4', '1.5.14') == '1.5.14'
assert flow.nextDefaultVersion('1.5.14', '1.5.14') == '1.5.15'
assert flow.nextDefaultVersion('1.5.9', '1.5.2') == '1.5.10'
assert flow.nextDefaultVersion('2.0.0', '1.99.99') == '2.0.1'
assert flow.nextDefaultVersion('1.99.99', '2.0.0') == '2.0.0'
assert flow.nextDefaultVersion('1.99999999999999999999.9', '1.2.3') == '1.99999999999999999999.10'
println 'Jenkins version defaults: 6 checks passed'
