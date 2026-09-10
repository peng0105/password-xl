"""Signed APKs and emulator upgrade/offline checks; never archive signing material."""
import base64
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

import builds
from model import OUT, env, file_record, read_json, require, run, version_code
from source import android_checkout, git


def sdk_tool(name):
    path = Path(env('ANDROID_HOME')) / 'build-tools/34.0.0' / name
    require(path.is_file(), 'Android build tools 34.0.0 are required')
    return str(path)


def certificate(apk):
    output = run([sdk_tool('apksigner'), 'verify', '--verbose', '--print-certs', str(apk)], capture=True)
    digests = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-f]+)', output)
    require(len(digests) == 1, 'Expected one verified APK signer')
    return digests[0]


def apk_metadata(apk):
    output = run([sdk_tool('aapt'), 'dump', 'badging', str(apk)], capture=True)
    package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", output)
    require(package and package[1] == 'com.passwordxl', 'APK applicationId changed')
    return int(package[2]), package[3]


def instrument(test_apk):
    run(['adb', 'install', '-r', str(test_apk)])
    output = run(['adb', 'shell', 'am', 'instrument', '-w', 'com.passwordxl.test/androidx.test.runner.AndroidJUnitRunner'], capture=True)
    require('OK (1 test)' in output and 'FAILURES' not in output and 'INSTRUMENTATION_FAILED' not in output,
            'Android entry/bridge/upgrade test failed: ' + output[-6000:])


def build(context, targets):
    directory, sha = android_checkout(context['android_sha'])
    require(sha == context['android_sha'], 'Android checkout SHA differs')
    dist = builds.frontend(context, 'android-local')
    code = version_code(context['version'])
    baseline = read_json(directory / 'ci/signing-baseline.json')
    git(['fetch', '--no-tags', env('ANDROID_URL'), baseline['commit']], env('GITEA_TOKEN'), directory)
    with tempfile.TemporaryDirectory(prefix='password-xl-signing-') as temp:
        temporary = Path(temp)
        historical = temporary / 'historical.apk'
        with historical.open('wb') as stream:
            subprocess.run(['git', 'show', baseline['commit'] + ':' + baseline['apk_path']], cwd=directory,
                           stdout=stream, check=True)
        historical_certificate = certificate(historical)
        expected = baseline.get('certificate_sha256', historical_certificate)
        changed_signing_key = expected != historical_certificate
        require(not changed_signing_key or baseline.get('legacy_upgrade') == 'export-and-reinstall',
                'Signing key change requires an explicit migration policy')
        require(code > apk_metadata(historical)[0], 'APK versionCode must upgrade the historical release')
        keystore = temporary / 'release.jks'
        keystore.write_bytes(base64.b64decode(env('ANDROID_KEYSTORE_BASE64'), validate=True))
        keystore.chmod(0o600)
        wrapper = directory / 'gradlew'
        wrapper.chmod(0o755)
        run([str(wrapper), '--no-daemon', '--max-workers=2', '-PreleaseVersion=' + context['version'],
             '-PlocalDist=' + str(dist), 'assembleOnlineRelease', 'assembleLocalRelease',
             'assembleOnlineReleaseAndroidTest', 'assembleLocalReleaseAndroidTest'], cwd=directory,
            extra_env={'ANDROID_KEYSTORE_PATH': str(keystore)})
        apks, tests = {}, {}
        for flavor in ('online', 'local'):
            candidates = list((directory / 'app/build/outputs/apk' / flavor / 'release').glob('*.apk'))
            require(len(candidates) == 1, 'Expected one signed release APK per flavor')
            apk = candidates[0]
            require(certificate(apk) == expected, 'APK signer differs from the historical release')
            require(apk_metadata(apk) == (code, context['version']), 'APK version mismatch')
            with zipfile.ZipFile(apk) as bundle:
                if flavor == 'local':
                    require(json.loads(bundle.read('assets/release.json')) == {k: context[k] for k in ('version', 'source_sha')},
                            'Local APK embeds stale frontend')
                else:
                    require('assets/index.html' not in bundle.namelist(), 'Online APK contains bundled local frontend')
            apks[flavor] = apk
            test_candidates = list((directory / 'app/build/outputs/apk/androidTest' / flavor / 'release').glob('*.apk'))
            require(len(test_candidates) == 1, 'Missing signed instrumentation APK')
            tests[flavor] = test_candidates[0]
        serial = run(['adb', 'get-serialno'], capture=True)
        require(serial.startswith('emulator-'), 'Android release tests require an isolated emulator')
        run(['adb', 'root'])
        run(['adb', 'wait-for-device'])
        run(['adb', 'install', str(historical)])
        if changed_signing_key:
            attempted = subprocess.run(['adb', 'install', '-r', str(apks['online'])], capture_output=True, text=True)
            require(attempted.returncode != 0 and 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' in (attempted.stdout + attempted.stderr),
                    'Expected Android to reject replacing the historical signer')
            # This is the isolated CI emulator, not an end-user device. Confirm the
            # documented migration boundary before testing upgrades within the new signer.
            run(['adb', 'uninstall', 'com.passwordxl'])
            run(['adb', 'install', str(apks['online'])])
        run(['adb', 'shell', 'am', 'start', '-W', '-n', 'com.passwordxl/.MainActivity'])
        run(['adb', 'shell', 'mkdir', '-p', '/data/data/com.passwordxl/files'])
        fixture = temporary / 'ci-upgrade.json'
        fixture.write_text('upgrade-fixture', encoding='utf-8')
        run(['adb', 'push', str(fixture), '/data/data/com.passwordxl/files/ci-upgrade.json'])
        run(['adb', 'shell', 'chmod', '666', '/data/data/com.passwordxl/files/ci-upgrade.json'])
        for flavor in ('online', 'local', 'online'):
            run(['adb', 'shell', 'cmd', 'connectivity', 'airplane-mode', 'enable' if flavor == 'local' else 'disable'])
            run(['adb', 'shell', 'svc', 'wifi', 'disable' if flavor == 'local' else 'enable'])
            run(['adb', 'shell', 'svc', 'data', 'disable' if flavor == 'local' else 'enable'])
            run(['adb', 'install', '-r', str(apks[flavor])])
            instrument(tests[flavor])
        records = []
        for target in targets:
            flavor = target.removeprefix('apk-')
            output = OUT / 'files' / f'password-xl-android-{flavor}-{context["version"]}.apk'
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(apks[flavor], output)
            records.append({**file_record(output, target), 'path': 'files/' + output.name,
                            'certificate_sha256': expected, 'version_code': code})
            records[-1]['legacy_upgrade'] = 'export-and-reinstall' if changed_signing_key else 'in-place'
        return records
