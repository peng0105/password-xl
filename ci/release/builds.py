"""Build commands usable on k3s and native GitHub runners."""
import json
import os
import shutil
import struct
import sys
import zipfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from model import OUT, ROOT, env, file_record, image_arch, pack_directory, read_json, require, run, sha256, write_json


def yarn(args, cwd=None):
    command = ['corepack', 'yarn', *args]
    if os.name == 'nt':
        # .cmd needs cmd.exe; all arguments here are fixed build commands, never user input.
        command = ['cmd.exe', '/d', '/c', 'corepack.cmd', 'yarn', *args]
    return run(command, cwd=cwd or ROOT / 'password-xl-web')


def frontend(context, mode='web'):
    output = OUT / ('dist-' + mode)
    marker = output / 'release.json'
    expected = {key: context[key] for key in ('version', 'source_sha')}
    if marker.exists() and read_json(marker) == expected:
        return output
    yarn(['install', '--immutable'])
    yarn(['exec', 'vue-tsc', '-b'])
    require(output.resolve().is_relative_to(OUT.resolve()), 'Build output must stay in .release')
    yarn(['exec', 'vite', 'build', '--mode', mode, '--outDir', str(output), '--emptyOutDir'])
    require((output / 'index.html').is_file(), 'Vite did not produce index.html')
    write_json(marker, expected)
    return output


@contextmanager
def gradle_cache_lock():
    cache = os.environ.get('GRADLE_SHARED_CACHE')
    if not cache:
        yield
        return
    require(os.name == 'posix', 'Shared CI Gradle cache requires POSIX file locking')
    import fcntl
    directory = Path(cache)
    directory.mkdir(parents=True, exist_ok=True)
    require(directory.resolve() == Path(env('GRADLE_USER_HOME')).resolve(), 'Gradle cache lock/home must match')
    with (directory / '.password-xl-ci.lock').open('a') as lock:
        print('Waiting for the shared Gradle cache lock', flush=True)
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def gradle(context, tasks, extra=None):
    dist = frontend(context)
    wrapper = ROOT / 'password-xl-service' / ('gradlew.bat' if os.name == 'nt' else 'gradlew')
    if os.name != 'nt':
        wrapper.chmod(0o755)
    # Invoke the wrapper class directly on Windows so cmd.exe cannot interpret proxy/ref characters.
    command = (['java', '--enable-native-access=ALL-UNNAMED', '-classpath', str(wrapper.parent / 'gradle/wrapper/gradle-wrapper.jar'),
                'org.gradle.wrapper.GradleWrapperMain'] if os.name == 'nt' else [str(wrapper)])
    mirror = os.environ.get('GRADLE_DISTRIBUTION_URL')
    if mirror:
        import re
        url = urlsplit(mirror)
        require(url.scheme == 'https' and url.hostname and not url.username and not url.query and not url.fragment,
                'Gradle mirror must be a plain HTTPS URL')
        properties = (wrapper.parent / 'gradle/wrapper/gradle-wrapper.properties').read_text()
        original = re.search(r'^distributionUrl=(.+)$', properties, re.MULTILINE)[1].replace('\\:', ':')
        require(Path(url.path).name == Path(urlsplit(original).path).name, 'Gradle mirror version differs from the wrapper')
        require(re.search(r'^distributionSha256Sum=[0-9a-f]{64}$', properties, re.MULTILINE), 'Gradle checksum must remain pinned')
        temporary = OUT / 'gradle-wrapper'
        temporary.mkdir(parents=True, exist_ok=True)
        jar = temporary / 'gradle-wrapper.jar'
        shutil.copyfile(wrapper.parent / 'gradle/wrapper/gradle-wrapper.jar', jar)
        properties = re.sub(r'^distributionUrl=.+$', lambda _: 'distributionUrl=' + mirror.replace(':', '\\:'), properties, flags=re.MULTILINE)
        (temporary / 'gradle-wrapper.properties').write_text(properties)
        command = ['java', '--enable-native-access=ALL-UNNAMED', '-classpath', str(jar), 'org.gradle.wrapper.GradleWrapperMain']
    args = [*command, '--no-daemon', '--console=plain', '--build-cache', '--max-workers=2',
            '-PreleaseVersion=' + context['version'], '-PfrontendDist=' + str(dist), *(extra or []), *tasks]
    # Java does not inherit HTTP(S)_PROXY automatically, unlike the Python/Node tools.
    for scheme in ('http', 'https'):
        configured = os.environ.get(scheme.upper() + '_PROXY')
        if configured:
            proxy = urlsplit(configured)
            require(proxy.scheme in ('http', 'https') and proxy.hostname and not proxy.username,
                    'Java CI proxy requires an HTTP(S) URL without embedded credentials')
            args += [f'-D{scheme}.proxyHost={proxy.hostname}', f'-D{scheme}.proxyPort={proxy.port or 80}']
    args += ['-Dhttp.nonProxyHosts=' + os.environ.get('NO_PROXY', 'localhost,127.0.0.1').replace(',', '|')]
    if os.environ.get('NEXUS_MAVEN_URL'):
        nexus = urlsplit(env('NEXUS_MAVEN_URL'))
        require(nexus.scheme == 'https' and nexus.hostname and not nexus.username, 'Nexus requires an HTTPS URL without credentials')
        args += ['--init-script', str(ROOT / 'ci/gradle/nexus.init.gradle')]
    with gradle_cache_lock():
        run(args, cwd=wrapper.parent, extra_env={'RELEASE_SOURCE_SHA': context['source_sha']})


def elf_arch(path):
    with Path(path).open('rb') as stream:
        header = stream.read(20)
    require(header[:4] == b'\x7fELF' and header[4] == 2, 'Native output must be a 64-bit ELF')
    machine = struct.unpack('<H' if header[5] == 1 else '>H', header[18:20])[0]
    require(machine in (62, 183), 'Unsupported native machine type')
    return 'amd64' if machine == 62 else 'arm64'


def dockerfile_image(context, target, cloud=False):
    module = ROOT / ('password-xl-web' if target.startswith('web-') else 'password-xl-service')
    image_dir = OUT / 'images'
    image_dir.mkdir(parents=True, exist_ok=True)
    image_path = image_dir / (target + '.tar')
    if target.startswith('web-'):
        source_dist = frontend(context)
        # Use an isolated context, never the developer's ignored dist or local credentials.
        build_context = OUT / 'contexts' / target
        shutil.copytree(module / 'nginx', build_context / 'nginx', dirs_exist_ok=True)
        shutil.copytree(source_dist, build_context / 'dist', dirs_exist_ok=True)
        shutil.copyfile(module / 'Dockerfile', build_context / 'Dockerfile')
    else:
        binary = module / 'build/native/nativeCompile/password-xl-service'
        require(elf_arch(binary) == image_arch(target), 'Native binary architecture does not match image')
        build_context = OUT / 'contexts' / target
        binary_dir = build_context / 'build/native/nativeCompile'
        binary_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(binary, binary_dir / binary.name)
        shutil.copyfile(module / 'Dockerfile', build_context / 'Dockerfile')
    labels = {'org.opencontainers.image.version': context['version'],
              'org.opencontainers.image.revision': context['source_sha']}
    build_args = {name: os.environ[name] for name in ('NGINX_IMAGE', 'RUNTIME_IMAGE') if os.environ.get(name)}
    if cloud:
        args = ['docker', 'buildx', 'build', '--platform', 'linux/' + image_arch(target),
                '--provenance=false', '--load',
                '-t', 'password-xl-worker:' + target]
        for key, value in labels.items():
            args += ['--label', key + '=' + value]
        for key, value in build_args.items():
            args += ['--build-arg', key + '=' + value]
        run([*args, str(build_context)])
        run(['docker', 'image', 'save', '--output', str(image_path), 'password-xl-worker:' + target])
        return 'docker-archive:' + str(image_path)
    args = ['buildctl', '--addr', env('BUILDKIT_HOST', 'tcp://127.0.0.1:1234'), 'build',
            '--frontend', 'dockerfile.v0', '--local', 'context=' + str(build_context),
            '--local', 'dockerfile=' + str(build_context), '--opt', 'platform=linux/' + image_arch(target),
            '--output', f'type=oci,dest={image_path}']
    cache_prefix = os.environ.get('REGISTRY_PRIVATE_PREFIX')
    if cache_prefix:
        # Separate per-target cache manifests from immutable product images and other projects.
        reference = cache_prefix.rstrip('/') + '/password-xl-build-cache:' + target
        args += ['--import-cache', 'type=registry,ref=' + reference,
                 '--export-cache', 'type=registry,ref=' + reference + ',mode=max,image-manifest=true,oci-mediatypes=true']
    for key, value in labels.items():
        args += ['--opt', 'label:' + key + '=' + value]
    for key, value in build_args.items():
        args += ['--opt', 'build-arg:' + key + '=' + value]
    run(args)
    return 'oci-archive:' + str(image_path)


def build_local(context, target):
    files = OUT / 'files'
    files.mkdir(parents=True, exist_ok=True)
    if target in ('dist-zip', 'dist-tar-gz'):
        suffix = '.zip' if target == 'dist-zip' else '.tar.gz'
        output = files / ('password-xl-web-dist-' + context['version'] + suffix)
        pack_directory(frontend(context), output)
        return file_record(output, target)
    if target == 'jar':
        gradle(context, ['build'])
        source = ROOT / f'password-xl-service/build/libs/password-xl-service-{context["version"]}.jar'
        require(source.exists(), 'Spring Boot JAR missing')
        with zipfile.ZipFile(source) as jar:
            marker = json.loads(jar.read('BOOT-INF/classes/static/release.json'))
        require(marker == {key: context[key] for key in ('version', 'source_sha')}, 'JAR contains stale frontend')
        output = files / source.name
        shutil.copyfile(source, output)
        run([sys.executable, str(ROOT / 'ci/release/jar-smoke.py'), str(output), json.dumps(context)])
        return file_record(output, target)
    if target.startswith('service-jvm-'):
        output = OUT / 'images' / (target + '.tar')
        output.parent.mkdir(parents=True, exist_ok=True)
        gradle(context, ['jibBuildTar'], ['-PtargetArch=' + image_arch(target), '-PjibTarPath=' + str(output)])
        return 'docker-archive:' + str(output)
    if target == 'service-x86':
        gradle(context, ['build', 'nativeCompile'])
    return dockerfile_image(context, target)


def desktop(context, targets):
    dist = frontend(context, 'electron')
    web = ROOT / 'password-xl-web'
    app = OUT / 'desktop-app'
    require(app.resolve().is_relative_to(OUT.resolve()), 'Desktop staging must stay in .release')
    if app.exists():
        shutil.rmtree(app)
    shutil.copytree(web / 'electron', app / 'electron')
    shutil.copytree(dist, app / 'dist')
    # Vite has bundled renderer dependencies. Only crypto-js is imported by the
    # Electron main process; shipping the build dependency tree breaks Universal DMGs.
    crypto = web / 'node_modules/crypto-js'
    require(not read_json(crypto / 'package.json').get('dependencies'), 'Review new crypto-js runtime dependencies')
    shutil.copytree(crypto, app / 'node_modules/crypto-js')
    metadata = read_json(web / 'package.json')
    for key in ('scripts', 'devDependencies', 'packageManager'):
        metadata.pop(key, None)
    metadata['dependencies'] = {'crypto-js': read_json(crypto / 'package.json')['version']}
    write_json(app / 'package.json', metadata)
    config = read_json(ROOT / 'ci/electron-builder.json')
    config['extends'] = str(ROOT / 'password-xl-web/electron/electron-builder.json5')
    config['files'] = ['package.json', 'electron/**/*', 'dist/**/*']
    config['directories'] = {'app': str(app), 'output': str(OUT / 'desktop')}
    for platform_name in ('win', 'linux'):
        config[platform_name]['icon'] = str(dist / 'icons/1024x1024.png')
    config_path = OUT / 'electron-builder.json'
    write_json(config_path, config)
    if targets == ['exe']:
        args = ['--win', 'nsis', '--x64']
    elif targets == ['dmg']:
        args = ['--mac', 'dmg', '--universal']
    else:
        require(set(targets) <= {'appimage', 'rpm', 'snap'}, 'Invalid desktop target combination')
        args = ['--linux', *['AppImage' if t == 'appimage' else t for t in targets], '--x64']
    yarn(['exec', 'electron-builder', '--config', str(config_path), '--publish', 'never', *args])
    records = []
    for target in targets:
        extension = 'AppImage' if target == 'appimage' else target
        candidates = list((OUT / 'desktop').glob('*.' + extension))
        require(len(candidates) == 1, f'Expected exactly one {extension} output')
        path = OUT / 'files' / candidates[0].name
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(candidates[0], path)
        record = file_record(path, target)
        record['path'] = 'files/' + path.name
        records.append(record)
    run(['node', str(ROOT / 'ci/release/electron-smoke.mjs'), str(OUT / 'desktop'), context['version']])
    return records
