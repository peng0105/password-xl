"""Real-architecture container smoke tests using disposable data only."""
import json
import platform
import re
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from builds import elf_arch
from model import image_arch, require, run


def http(base, route, payload=None, token=None, raw=False, content_type=None):
    headers = {'Authorization': 'Bearer ' + token} if token else {}
    data = payload
    if payload is not None:
        if not isinstance(payload, bytes):
            data = json.dumps(payload).encode()
            headers['Content-Type'] = 'application/json'
        else:
            headers['Content-Type'] = content_type or 'application/octet-stream'
    with urllib.request.urlopen(urllib.request.Request(base + route, data=data, headers=headers), timeout=15) as response:
        body = response.read()
        return body if raw else json.loads(body)


def wait_ready(base, path):
    for _ in range(90):
        try:
            http(base, path, raw=True)
            return
        except (OSError, urllib.error.URLError):
            time.sleep(2)
    raise RuntimeError('Container did not become healthy within 180 seconds')


def check_image(image, context, target):
    expected_arch = image_arch(target)
    actual_host = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(platform.machine().lower())
    require(actual_host == expected_arch, 'Smoke tests must run on the real target architecture')
    info = json.loads(run(['docker', 'image', 'inspect', image], capture=True))[0]
    require(info['Architecture'] == expected_arch and info['Os'] == 'linux', 'Image architecture mismatch')
    labels = info['Config'].get('Labels') or {}
    for key, value in [('revision', context['source_sha']), ('version', context['version'])]:
        require(labels.get('org.opencontainers.image.' + key) == value, 'Image labels do not match source/version')
    name = 'password-xl-smoke-' + secrets.token_hex(6)
    web = target.startswith('web-')
    port = 80 if web else 8080
    with tempfile.TemporaryDirectory(prefix='password-xl-smoke-') as temporary:
        data = Path(temporary)
        password = secrets.token_hex(20)
        (data / 'password-xl.toml').write_text(f'[[user]]\nusername="ci-test"\npassword="{password}"\n')
        args = ['docker', 'run', '-d', '--name', name, '-p', f'127.0.0.1::{port}']
        if not web:
            args += ['-e', 'DATA_DIR=/password-xl-service', '-v', f'{data}:/password-xl-service']
        try:
            run([*args, image])
            published = run(['docker', 'port', name, str(port) + '/tcp'], capture=True).splitlines()[0]
            base = 'http://' + published
            wait_ready(base, '/healthz' if web else '/service/health')
            html = http(base, '/', raw=True).decode()
            require('<html' in html.lower(), 'Frontend HTML missing')
            assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
            require(assets, 'Frontend has no built assets')
            for asset in assets:
                require(http(base, asset, raw=True), 'Empty frontend asset')
            if web:
                require(http(base, '/release.json') == {k: context[k] for k in ('version', 'source_sha')},
                        'Web image contains stale frontend')
                run(['docker', 'exec', name, 'nginx', '-t'])
                return
            token = http(base, '/login', {'username': 'ci-test', 'password': password})['data']
            require(isinstance(token, str) and token, 'Login failed')
            require(http(base, '/release.json', token=token) == {k: context[k] for k in ('version', 'source_sha')},
                    'Service image contains stale frontend')
            value = {'key': 'ci-smoke.json', 'content': '{"test":"persistent"}'}
            require(http(base, '/put', value, token)['code'] == 200, 'Write failed')
            require(http(base, '/get', {'key': value['key']}, token)['data']['content'] == value['content'], 'Read failed')
            boundary = 'ci-upload-boundary'
            svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
            upload = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.svg"\r\n'
                      'Content-Type: image/svg+xml\r\n\r\n').encode() + svg + f'\r\n--{boundary}--\r\n'.encode()
            uploaded = http(base, '/uploadImage/ci', upload, token, content_type='multipart/form-data; boundary=' + boundary)
            # The controller wraps image metadata in RestResult.
            image_key = uploaded.get('data', uploaded)['objectKey']
            require(http(base, '/image' + image_key, raw=True) == svg, 'Uploaded image cannot be read')
            if target in ('service-x86', 'service-arm'):
                binary = data / 'native-binary'
                run(['docker', 'cp', name + ':/app/password-xl-service', str(binary)])
                require(elf_arch(binary) == expected_arch, 'Wrong ELF architecture')
                linked = run(['docker', 'exec', name, 'ldd', '/app/password-xl-service'], capture=True)
                require('not found' not in linked, 'Missing native shared library')
            run(['docker', 'restart', name])
            # Docker may allocate a different ephemeral host port on restart.
            published = run(['docker', 'port', name, str(port) + '/tcp'], capture=True).splitlines()[0]
            base = 'http://' + published
            wait_ready(base, '/service/health')
            token = http(base, '/login', {'username': 'ci-test', 'password': password})['data']
            require(http(base, '/get', {'key': value['key']}, token)['data']['content'] == value['content'],
                    'Data was lost after restart')
            require(http(base, '/delete', {'key': value['key']}, token)['code'] == 200, 'Delete failed')
            require(http(base, '/get', {'key': value['key']}, token)['code'] == 404, 'Deleted data still exists')
        except BaseException:
            # Only this isolated test container is inspected. Keep useful startup
            # diagnostics before removing it, and redact fixture/default passwords.
            logs = subprocess.run(['docker', 'logs', '--tail', '100', name], capture_output=True, text=True)
            for line in (logs.stdout + logs.stderr).splitlines():
                if not re.search(r'(?:密码|password)\s*[:：]', line, re.IGNORECASE):
                    print(line.replace(password, '[fixture]'), flush=True)
            raise
        finally:
            if not web:
                subprocess.run(['docker', 'exec', name, 'chmod', '-R', 'a+rwX', '/password-xl-service'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
