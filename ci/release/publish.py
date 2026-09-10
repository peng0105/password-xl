"""GitHub/Gitea release assets and immutable per-target receipts."""
import hashlib
import json
import mimetypes
import urllib.parse
import uuid
from pathlib import Path

import cache
from api import Api
from model import OUT, checked_relative, env, identity, require, sha256, write_json


class Release:
    def __init__(self, provider, context):
        self.provider = provider
        self.context = context
        self.github = provider == 'github'
        self.api = Api('https://api.github.com' if self.github else env('GITEA_URL').rstrip('/') + '/api/v1',
                       env('GH_TOKEN' if self.github else 'GITEA_TOKEN'), self.github)
        self.repo = env('GITHUB_REPO' if self.github else 'GITEA_REPO')
        require(len(self.repo.split('/')) == 2, 'Repository must be owner/name')
        self.path = '/repos/' + self.repo
        tag = urllib.parse.quote(context['version'], safe='')
        self.release = self.api.maybe(self.path + '/releases/tags/' + tag)
        if not self.release:
            # The tag endpoint serves published releases; drafts must also be searched explicitly.
            matching = [item for item in self.api.pages(self.path + '/releases') if item['tag_name'] == context['version']]
            require(len(matching) <= 1, 'Multiple releases exist for this tag; resolve the ambiguity before retrying')
            self.release = matching[0] if matching else None
        if not self.release:
            self.release = self.api.request('POST', self.path + '/releases', {
                'tag_name': context['version'], 'target_commitish': context['source_sha'],
                'name': 'Release ' + context['version'], 'body': 'Jenkins release in progress.',
                'draft': True, 'prerelease': False,
            })
        require(not self.release.get('immutable'), 'Release immutability must be disabled for incremental publication')
        self.assets_path = f'{self.path}/releases/{self.release["id"]}/assets'
        self._assets = None
        self._contents = {}

    def assets(self, refresh=False):
        if self._assets is None or refresh:
            self._assets = {asset['name']: asset for asset in self.api.pages(self.assets_path)}
        return self._assets

    def asset_key(self, asset):
        return cache.asset_key(self.api.base, self.repo, self.release['id'], asset)

    def known_digest(self, asset):
        digest = asset.get('digest', '') or ''
        import re
        if re.fullmatch('sha256:[0-9a-f]{64}', digest):
            return digest[7:]
        return cache.known_digest(self.asset_key(asset))

    def content(self, asset):
        key = self.asset_key(asset)
        digest = self.known_digest(asset)
        if digest:
            content = cache.load(digest)
            if content is not None:
                return content
        if self.github:
            content = self.api.request('GET', f'{self.path}/releases/assets/{asset["id"]}',
                                       headers={'Accept': 'application/octet-stream'}, binary=True)
        else:
            content = self.api.request('GET', asset['browser_download_url'], binary=True)
        actual = hashlib.sha256(content).hexdigest()
        require(not digest or actual == digest, 'Release asset differs from its verified digest')
        cache.remember(content, key)
        return content

    def get_json(self, name):
        asset = self.assets().get(name)
        if not asset:
            return None
        if name not in self._contents:
            self._contents[name] = json.loads(self.content(asset))
        return self._contents[name]

    def put(self, path, mutable=False):
        path = Path(path)
        existing = self.assets().get(path.name)
        digest = sha256(path)
        if existing:
            known = self.known_digest(existing)
            same = (known or hashlib.sha256(self.content(existing)).hexdigest()) == digest
            if same:
                return
            require(mutable, f'Immutable release asset conflict: {path.name}')
            delete_path = (f'{self.path}/releases/assets/{existing["id"]}' if self.github
                           else self.assets_path + '/' + str(existing['id']))
            self.api.request('DELETE', delete_path)
            self.assets().pop(path.name, None)
            self._contents.pop(path.name, None)
        if self.github:
            uploader = Api('https://uploads.github.com', env('GH_TOKEN'), True)
            uploaded = uploader.request('POST', self.assets_path + '?name=' + urllib.parse.quote(path.name),
                                        path.read_bytes(), {'Content-Type': mimetypes.guess_type(path.name)[0] or 'application/octet-stream'})
        else:
            boundary = 'release-' + uuid.uuid4().hex
            head = (f'--{boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="{path.name}"'
                    '\r\nContent-Type: application/octet-stream\r\n\r\n').encode()
            body = head + path.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
            uploaded = self.api.request('POST', self.assets_path + '?name=' + urllib.parse.quote(path.name), body,
                                        {'Content-Type': 'multipart/form-data; boundary=' + boundary})
        require(uploaded and uploaded.get('name') == path.name and uploaded.get('size') == path.stat().st_size,
                'Uploaded asset metadata mismatch')
        self.assets()[path.name] = uploaded
        actual = self.known_digest(uploaded) or hashlib.sha256(self.content(uploaded)).hexdigest()
        require(actual == digest, 'Uploaded asset checksum mismatch')
        cache.remember(path.read_bytes(), self.asset_key(uploaded))

    def reserve(self):
        main = {key: self.context[key] for key in ('version', 'source_sha')}
        reservations = {'release-source.json': main}
        if self.context.get('android_sha'):
            reservations['android-source.json'] = {'android_sha': self.context['android_sha']}
        for name, value in reservations.items():
            existing = self.get_json(name)
            require(existing is None or existing == value, 'Version already belongs to different source; bump package.json')
            if existing is not None:
                continue
            path = OUT / 'metadata' / name
            write_json(path, value)
            self.put(path)

    def finish(self, manifest, notes):
        lines = ['Release ' + self.context['version'], '', notes or '', '',
                 'Source: `' + self.context['source_sha'] + '`',
                 'Targets: ' + ', '.join(manifest['targets']), '',
                 'See release-manifest.json and SHA256SUMS for provenance and checksums.']
        if any(f.get('legacy_upgrade') == 'export-and-reinstall' for f in manifest.get('files', [])):
            lines += ['', 'Android 签名变更：旧版用户必须先导出数据，再卸载旧版、安装新版并导入。',
                      '新签名 APK 无法直接覆盖旧签名安装；新版联网版和本地版可互相覆盖。']
        data = {'name': 'Release ' + self.context['version'], 'body': '\n'.join(lines), 'draft': False, 'prerelease': False}
        if self.github:
            data['make_latest'] = 'legacy'
        self.api.request('PATCH', f'{self.path}/releases/{self.release["id"]}', data)


def releases(context):
    result = [Release(provider, context) for provider in ('github', 'gitea')]
    for release in result:
        release.reserve()
    return result


def restore_target(context, target, destination, endpoints=None):
    """Resume from matching, verified receipts; never download a different run's 'latest'."""
    endpoints = endpoints or releases(context)
    receipts = [release.get_json('receipt-' + target + '.json') for release in endpoints]
    available = [receipt for receipt in receipts if receipt]
    if not available:
        receipts = [release.get_json('validated-' + target + '.json') for release in endpoints]
        available = [receipt for receipt in receipts if receipt]
        if not available:
            return None
    receipt = available[0]
    require(all(value == receipt for value in available), 'Release receipts disagree across providers')
    require(receipt['source_sha'] == context['source_sha'] and receipt['version'] == context['version'],
            'Receipt source mismatch')
    if target.startswith('apk-'):
        require(receipt.get('android_sha') == context.get('android_sha'), 'APK receipt source mismatch')
    for record in receipt.get('files', []):
        require('/' not in checked_relative(record['name']), 'Unsafe asset filename')
        path = Path(destination) / record['name']
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_file() and sha256(path) == record['sha256']:
            continue
        content = cache.load(record['sha256'])
        if content is not None:
            path.write_bytes(content)
            continue
        found = False
        # Prefer the in-cluster Gitea route on Jenkins; GitHub remains a repair source.
        for endpoint in sorted(endpoints, key=lambda endpoint: endpoint.provider != 'gitea'):
            asset = endpoint.assets().get(record['name'])
            if asset:
                path.write_bytes(endpoint.content(asset))
                found = True
                break
        if not found and receipt['worker_runs']:
            from workers import recover_file
            recover_file(receipt['worker_runs'], record, path)
        elif not found:
            # Dist/JAR outputs are reproducible. Rebuild is accepted only if bytes match the saved checksum.
            from builds import build_local
            require(target in ('jar', 'dist-zip', 'dist-tar-gz'), 'No recoverable artifact remains')
            rebuilt = build_local(context, target)
            require(rebuilt['sha256'] == record['sha256'], 'Rebuilt bytes differ; restore the original Jenkins artifact')
        require(sha256(path) == record['sha256'], 'Saved artifact checksum mismatch')
        cache.remember(path.read_bytes())
    return receipt


def target_receipt(context, target, files, images, worker_runs):
    receipt = {'schema': 1, **identity(context), 'target': target, 'files': files,
               'images': images, 'worker_runs': worker_runs}
    if not target.startswith('apk-'):
        receipt['android_sha'] = None
    return receipt


def save_checkpoint(context, target, files, images, worker_runs, endpoints=None):
    path = OUT / 'metadata' / ('validated-' + target + '.json')
    write_json(path, target_receipt(context, target, files, images, worker_runs))
    for release in endpoints or releases(context):
        release.put(path)


def publish_target(context, target, files, images, worker_runs, endpoints=None):
    receipt = target_receipt(context, target, files, images, worker_runs)
    path = OUT / 'metadata' / ('receipt-' + target + '.json')
    write_json(path, receipt)
    for release in endpoints or releases(context):
        for record in files:
            release.put(OUT / 'files' / record['name'])
        release.put(path)


def combined_manifest(context, current):
    """Reconstruct all completed targets, including earlier partial publications."""
    endpoints = releases(context)
    merged = {'schema': 1, **identity(context), 'targets': [], 'files': [], 'images': [], 'worker_runs': []}
    from model import TARGETS
    for target in TARGETS:
        values = [release.get_json('receipt-' + target + '.json') for release in endpoints]
        if not any(values):
            continue
        require(all(values) and values[0] == values[1], 'Both releases must contain matching target receipts')
        receipt = values[0]
        require(receipt['source_sha'] == context['source_sha'], 'Existing target has different source')
        if receipt.get('android_sha'):
            if merged.get('android_sha'):
                require(merged['android_sha'] == receipt['android_sha'], 'Android revision conflict')
            merged['android_sha'] = receipt['android_sha']
        merged['targets'].append(target)
        for key in ('files', 'images', 'worker_runs'):
            merged[key].extend(receipt.get(key, []))
    require(set(current['targets']) <= set(merged['targets']), 'Publication receipts are incomplete')
    merged['requested_targets'] = context['targets']
    merged['jenkins_build'] = context.get('jenkins_build')
    merged['status'] = 'artifacts-published'
    path = OUT / 'metadata' / 'release-manifest.json'
    write_json(path, merged)
    sums = OUT / 'metadata' / 'SHA256SUMS'
    sums.write_text(''.join(f'{f["sha256"]}  {f["name"]}\n' for f in sorted(merged['files'], key=lambda x: x['name']))
                   + f'{sha256(path)}  release-manifest.json\n', encoding='utf-8')
    for release in endpoints:
        release.put(path, mutable=True)
        release.put(sums, mutable=True)
    return endpoints, merged
