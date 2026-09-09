"""Assets-first OSS deployment, immutable rollback copies and awaited CDN refresh."""
import hashlib
import json
import mimetypes
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from model import OUT, checked_relative, env, read_json, require, sha256, write_json


def configuration():
    config = {key: env('OSS_' + key.upper()) for key in ('bucket', 'endpoint', 'prefix', 'public_url')}
    require(config['endpoint'].startswith('https://'), 'OSS endpoint must use HTTPS')
    # A literal / explicitly selects the root; an absent prefix never does so implicitly.
    config['prefix'] = config['prefix'].strip('/')
    if config['prefix']:
        checked_relative(config['prefix'])
        config['prefix'] += '/'
    parsed = urllib.parse.urlsplit(config['public_url'])
    require(parsed.scheme == 'https' and parsed.netloc and parsed.path in ('', '/') and not parsed.query and not parsed.fragment,
            'OSS_PUBLIC_URL must be the HTTPS site root URL')
    config['public_url'] = config['public_url'].rstrip('/') + '/'
    env('OSS_ACCESS_KEY_ID')
    env('OSS_ACCESS_KEY_SECRET')
    return config


class Storage:
    def __init__(self, config):
        import oss2
        self.bucket = oss2.Bucket(oss2.Auth(env('OSS_ACCESS_KEY_ID'), env('OSS_ACCESS_KEY_SECRET')),
                                  config['endpoint'], config['bucket'])
        self.prefix = config['prefix']

    def get(self, name):
        return self.bucket.get_object(self.prefix + checked_relative(name)).read()

    def exists(self, name):
        return self.bucket.object_exists(self.prefix + checked_relative(name))

    def names(self):
        import oss2
        return [item.key[len(self.prefix):] for item in oss2.ObjectIterator(self.bucket, prefix=self.prefix)
                if not item.key.endswith('/') and not item.key[len(self.prefix):].startswith('_releases/')]

    def put(self, name, data, cache='no-cache', immutable=False):
        key = self.prefix + checked_relative(name)
        if immutable and self.exists(name):
            require(hashlib.sha256(self.get(name)).digest() == hashlib.sha256(data).digest(), 'OSS version copy conflict')
            return
        self.bucket.put_object(key, data, headers={
            'Cache-Control': cache, 'Content-Type': mimetypes.guess_type(name)[0] or 'application/octet-stream',
            'x-oss-meta-sha256': hashlib.sha256(data).hexdigest(),
        })
        require(hashlib.sha256(self.get(name)).digest() == hashlib.sha256(data).digest(), 'OSS upload checksum mismatch')


def cdn_call(action, values):
    from aliyunsdkcore.client import AcsClient
    from aliyunsdkcore.request import CommonRequest
    client = AcsClient(env('CDN_ACCESS_KEY_ID', env('OSS_ACCESS_KEY_ID')),
                       env('CDN_ACCESS_KEY_SECRET', env('OSS_ACCESS_KEY_SECRET')), 'cn-hangzhou')
    request = CommonRequest()
    request.set_accept_format('json')
    request.set_domain('cdn.aliyuncs.com')
    request.set_version('2018-05-10')
    request.set_action_name(action)
    request.set_method('POST')
    request.set_protocol_type('https')
    for key, value in values.items():
        request.add_query_param(key, value)
    return json.loads(client.do_action_with_exception(request))


def preflight():
    config = configuration()
    # This read also validates the CDN permission before release/image side effects.
    cdn_call('DescribeRefreshTasks', {'ObjectPath': config['public_url'], 'PageSize': '1'})
    Storage(config).names()
    return config


def cdn_refresh(config):
    response = cdn_call('RefreshObjectCaches', {'ObjectPath': config['public_url'], 'ObjectType': 'Directory'})
    task_ids = response['RefreshTaskId'].split(',')
    for task_id in task_ids:
        deadline = time.monotonic() + int(env('CDN_TIMEOUT_SECONDS', '900'))
        while time.monotonic() < deadline:
            tasks = cdn_call('DescribeRefreshTasks', {'TaskId': task_id})['Tasks']['CDNTask']
            require(not any(t['Status'].lower() == 'failed' for t in tasks), 'CDN refresh failed')
            if tasks and all(t['Status'].lower() == 'complete' for t in tasks):
                break
            time.sleep(10)
        else:
            raise TimeoutError('CDN refresh timed out')
    return task_ids


def public_verify(config, manifest):
    for file in manifest['files']:
        url = config['public_url'] + urllib.parse.quote(file['name'], safe='/')
        with urllib.request.urlopen(url, timeout=30) as response:
            digest = hashlib.sha256(response.read()).hexdigest()
        require(digest == file['sha256'], 'CDN served an unexpected file: ' + file['name'])


def activate(storage, config, manifest, backup):
    files = sorted(manifest['files'], key=lambda f: (f['name'].endswith('.html'), f['name']))
    # Validate the entire backup before changing even the first live file.
    for file in files:
        data = storage.get(backup + '/files/' + checked_relative(file['name']))
        require(hashlib.sha256(data).hexdigest() == file['sha256'], 'Rollback copy checksum mismatch')
    for file in files:
        name = checked_relative(file['name'])
        data = storage.get(backup + '/files/' + name)
        require(hashlib.sha256(data).hexdigest() == file['sha256'], 'Rollback copy checksum mismatch')
        cache = 'public,max-age=31536000,immutable' if re.search(r'^assets/.+-[A-Za-z0-9_-]{8,}\.', name) else 'no-cache'
        storage.put(name, data, cache)
    tasks = cdn_refresh(config)
    public_verify(config, manifest)
    storage.put('_releases/current.json', json.dumps({'deployment': manifest['deployment']}).encode())
    return {'deployment': manifest['deployment'], 'cdn_tasks': tasks, 'status': 'verified'}


def snapshot_existing(storage):
    """Adopt the pre-Jenkins site without altering its entry or public assets."""
    if storage.exists('_releases/current.json'):
        return json.loads(storage.get('_releases/current.json'))
    names = sorted(storage.names())
    if not names:
        return None
    require('index.html' in names, 'Existing OSS prefix has no index.html; confirm the deployment prefix')
    contents = {checked_relative(name): storage.get(name) for name in names}
    files = [{'name': name, 'sha256': hashlib.sha256(data).hexdigest()} for name, data in contents.items()]
    fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    deployment = 'legacy-' + fingerprint[:12]
    backup = '_releases/' + deployment
    manifest = {'deployment': deployment, 'version': None, 'source_sha': None, 'files': files}
    for name, data in contents.items():
        storage.put(backup + '/files/' + name, data, immutable=True)
    storage.put(backup + '/manifest.json', (json.dumps(manifest, sort_keys=True) + '\n').encode(), immutable=True)
    # Detect concurrent legacy deployment rather than binding a mixed snapshot.
    require(sorted(storage.names()) == names, 'Existing OSS site changed during backup')
    for file in files:
        require(hashlib.sha256(storage.get(file['name'])).hexdigest() == file['sha256'], 'Existing OSS site changed during backup')
    previous = {'deployment': deployment}
    storage.put('_releases/current.json', json.dumps(previous).encode())
    return previous


def deploy(context, directory):
    config = preflight()
    storage = Storage(config)
    directory = Path(directory)
    require(read_json(directory / 'release.json') == {k: context[k] for k in ('version', 'source_sha')}, 'OSS dist mismatch')
    deployment = context['version'] + '-' + context['source_sha'][:12]
    backup = '_releases/' + deployment
    files = [{'name': p.relative_to(directory).as_posix(), 'sha256': sha256(p)}
             for p in sorted(directory.rglob('*')) if p.is_file()]
    require(any(f['name'] == 'index.html' for f in files), 'OSS dist lacks an HTML entry')
    manifest = {'deployment': deployment, 'version': context['version'], 'source_sha': context['source_sha'], 'files': files}
    for file in files:
        storage.put(backup + '/files/' + file['name'], (directory / file['name']).read_bytes(), immutable=True)
    storage.put(backup + '/manifest.json', (json.dumps(manifest, sort_keys=True) + '\n').encode(), immutable=True)
    previous = snapshot_existing(storage)
    write_json(OUT / 'oss-deployment.json', {'previous': previous, **manifest, 'status': 'activating'})
    result = activate(storage, config, manifest, backup)
    write_json(OUT / 'oss-deployment.json', {'previous': previous, **manifest, **result})
    return result


def rollback(deployment):
    require(deployment and re.fullmatch(r'(?:\d+\.\d+\.\d+|legacy)-[0-9a-f]{12}', deployment), 'Invalid rollback deployment ID')
    config = preflight()
    storage = Storage(config)
    backup = '_releases/' + deployment
    manifest = json.loads(storage.get(backup + '/manifest.json'))
    require(manifest['deployment'] == deployment, 'Rollback manifest identity mismatch')
    result = activate(storage, config, manifest, backup)
    write_json(OUT / 'oss-rollback.json', result)
    return result
