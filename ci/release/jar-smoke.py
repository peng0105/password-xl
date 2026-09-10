"""Run a bootJar twice with isolated fixture data; also usable without a Docker daemon."""
import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
from pathlib import Path

from model import require
from smoke import http, wait_ready


def check_jar(artifact, context):
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='password-xl-jar-smoke-') as temp:
        data = Path(temp)
        password = secrets.token_hex(20)
        (data / 'password-xl.toml').write_text(f'[[user]]\nusername="ci-test"\npassword="{password}"\n')
        base = f'http://127.0.0.1:{port}'
        for iteration in range(2):
            with (data / 'service.log').open('ab') as log:
                process = subprocess.Popen(['java', '-jar', str(Path(artifact).resolve()),
                                            '--server.address=127.0.0.1', '--server.port=' + str(port)],
                                           cwd=data, env={**os.environ, 'DATA_DIR': str(data)}, stdout=log, stderr=log)
                try:
                    wait_ready(base, '/service/health')
                    token = http(base, '/login', {'username': 'ci-test', 'password': password})['data']
                    require(http(base, '/release.json', token=token) == {k: context[k] for k in ('version', 'source_sha')},
                            'JAR serves an unexpected frontend')
                    if iteration == 0:
                        require(http(base, '/put', {'key': 'ci.json', 'content': 'persistent'}, token)['code'] == 200, 'JAR write failed')
                    require(http(base, '/get', {'key': 'ci.json'}, token)['data']['content'] == 'persistent', 'JAR restart lost data')
                    if iteration == 1:
                        require(http(base, '/delete', {'key': 'ci.json'}, token)['code'] == 200, 'JAR delete failed')
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=10)
    print('JAR startup, version, login, read/write and restart persistence passed')


if __name__ == '__main__':
    check_jar(sys.argv[1], json.loads(sys.argv[2]))
