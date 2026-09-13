"""Mirror one completed GitHub release to Gitee, preserving bytes and tag identity."""
import argparse
import hashlib
import json
import os
import re
import urllib.parse
import uuid
from pathlib import Path

from api import Api, ApiError
import cache
from model import OUT, checked_relative, env, require, write_json
import source

MAX_ATTACHMENT_BYTES = 100_000_000


class Gitee(Api):
    def __init__(self):
        super().__init__('https://gitee.com/api/v5', env('GITEE_TOKEN'))

    def request(self, method, path, data=None, headers=None, binary=False):
        headers = {'Authorization': 'Bearer ' + self.token, **(headers or {})}
        if isinstance(data, dict):
            data = urllib.parse.urlencode({k: str(v).lower() if isinstance(v, bool) else v for k, v in data.items()}).encode()
            headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
        return super().request(method, path, data, headers, binary)


def checked_tag(gh, repo, version):
    ref = gh.request('GET', f'/repos/{repo}/git/ref/tags/' + urllib.parse.quote(version, safe=''))['object']
    for _ in range(8):
        if ref['type'] == 'commit':
            return ref['sha']
        require(ref['type'] == 'tag', 'Release tag does not refer to a commit')
        ref = gh.request('GET', f'/repos/{repo}/git/tags/' + ref['sha'])['object']
    raise ValueError('Nested tag limit exceeded')


def sync_tag(version, sha, gh_repo, gitee_repo):
    url = 'https://gitee.com/' + gitee_repo + '.git'
    refs = source.git(['ls-remote', url, 'refs/tags/' + version, 'refs/tags/' + version + '^{}'], env('GITEE_TOKEN')).splitlines()
    found = {ref: commit for commit, ref in (line.split('\t') for line in refs)}
    if found:
        require(found.get('refs/tags/' + version + '^{}', found.get('refs/tags/' + version)) == sha,
                'Gitee release tag belongs to different source')
        return
    # Fetch into FETCH_HEAD, never overwrite a local tag or move a branch.
    source.git(['fetch', '--no-tags', 'https://github.com/' + gh_repo + '.git', 'refs/tags/' + version], env('GH_TOKEN'))
    require(source.git(['rev-parse', 'FETCH_HEAD^{commit}'], env('GH_TOKEN')) == sha, 'GitHub tag changed during synchronization')
    source.git(['push', url, 'FETCH_HEAD:refs/tags/' + version], env('GITEE_TOKEN'))


def asset_bytes(gh, repo, asset):
    advertised = asset.get('digest') or ''
    digest = advertised[7:] if advertised.startswith('sha256:') else None
    content = cache.load(digest) if digest else None
    if content is None:
        content = gh.request('GET', f'/repos/{repo}/releases/assets/{asset["id"]}',
                             headers={'Accept': 'application/octet-stream'}, binary=True)
    actual = hashlib.sha256(content).hexdigest()
    require(len(content) == asset['size'] and (not digest or digest == actual), 'GitHub attachment checksum/size mismatch')
    cache.remember(content)
    return content, actual


def attachment_key(repo, release_id, asset):
    # Gitee provides delete/upload, not in-place replacement of an attachment ID.
    return hashlib.sha256(json.dumps(['gitee', repo, release_id,
        asset['id'], asset['name'], asset['size']], sort_keys=True).encode()).hexdigest()


def synchronize(version=None, expected_sha=None):
    gh, api = Api('https://api.github.com', env('GH_TOKEN'), True), Gitee()
    gh_repo = env('GITHUB_REPO')
    gitee_repo = urllib.parse.urlsplit(env('GITEE_URL')).path.strip('/').removesuffix('.git')
    require(len(gitee_repo.split('/')) == 2, 'Gitee repository must be owner/name')
    path = '/repos/' + gitee_repo
    release = gh.request('GET', '/repos/' + gh_repo + '/releases/' + ('tags/' + urllib.parse.quote(version, safe='') if version else 'latest'))
    require(not release['draft'] and not release['prerelease'], 'Only a completed stable release can be synchronized')
    version = release['tag_name']
    sha = checked_tag(gh, gh_repo, version)
    require(not expected_sha or sha == expected_sha, 'GitHub release source mismatch')
    assets = [a for a in gh.pages(f'/repos/{gh_repo}/releases/{release["id"]}/assets')
              if not a['name'].lower().endswith('.json')]
    require(len({a['name'] for a in assets}) == len(assets), 'GitHub attachment names are not unique')
    report = {'version': version, 'source_sha': sha, 'github_release_id': release['id'],
              'status': 'synchronizing', 'files': []}
    destination = OUT / 'gitee-release.json'
    write_json(destination, report)
    try:
        sync_tag(version, sha, gh_repo, gitee_repo)
        current = api.maybe(path + '/releases/tags/' + urllib.parse.quote(version, safe=''))
        if not current:
            current = api.request('POST', path + '/releases', {'tag_name': version, 'target_commitish': sha,
                'name': release['name'], 'body': 'Jenkins 正在同步附件，尚未完成。', 'prerelease': True})
        report['gitee_release_id'] = current['id']
        attachment_path = f'{path}/releases/{current["id"]}/attach_files'
        remote = api.pages(attachment_path)
        require(len({a['name'] for a in remote}) == len(remote), 'Gitee attachment names are not unique')
        existing = {a['name']: a for a in remote}
        links = []
        for asset in assets:
            name = checked_relative(asset['name'])
            require('/' not in name, 'Unsafe release attachment name')
            if asset['size'] > MAX_ATTACHMENT_BYTES:
                advertised = asset.get('digest') or ''
                digest = advertised[7:] if re.fullmatch(r'sha256:[0-9a-f]{64}', advertised) else asset_bytes(gh, gh_repo, asset)[1]
                url = asset['browser_download_url']
                require(url.startswith('https://github.com/' + gh_repo + '/releases/download/'), 'Unexpected GitHub download URL')
                links.append({'name': name, 'url': url, 'size': asset['size'], 'sha256': digest})
                report['files'].append({**links[-1], 'mode': 'github-link'})
                write_json(destination, report)
                print('Gitee references GitHub for ' + name + ' (over 100 MB)', flush=True)
                continue
            content, digest = asset_bytes(gh, gh_repo, asset)
            found = existing.get(name)
            reused = bool(found)
            if found:
                key = attachment_key(gitee_repo, current['id'], found)
                known = cache.known_digest(key)
                if not known:
                    returned = api.request('GET', attachment_path + '/' + str(found['id']) + '/download', binary=True)
                    known = hashlib.sha256(returned).hexdigest()
                    cache.remember(returned, key)
                if known != digest:
                    require(name in ('publication.json', 'release-manifest.json', 'SHA256SUMS'),
                            'Gitee attachment content conflict: ' + name)
                    api.request('DELETE', attachment_path + '/' + str(found['id']))
                    found, reused = None, False
            if not found:
                boundary = 'password-xl-' + uuid.uuid4().hex
                head = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"'
                        '\r\nContent-Type: application/octet-stream\r\n\r\n').encode()
                try:
                    api.request('POST', attachment_path, head + content + f'\r\n--{boundary}--\r\n'.encode(),
                                {'Content-Type': 'multipart/form-data; boundary=' + boundary})
                except Exception:
                    # An interrupted upload may have succeeded: re-list, then verify before retrying.
                    matches = [a for a in api.pages(attachment_path) if a['name'] == name]
                    if not matches:
                        raise
                matches = [a for a in api.pages(attachment_path) if a['name'] == name]
                require(len(matches) == 1, 'Uploaded Gitee attachment could not be uniquely identified')
                found = matches[0]
            key = attachment_key(gitee_repo, current['id'], found)
            if cache.known_digest(key) != digest:
                returned = api.request('GET', attachment_path + '/' + str(found['id']) + '/download', binary=True)
                require(len(returned) == len(content) and hashlib.sha256(returned).hexdigest() == digest,
                        'Gitee attachment content conflict: ' + name)
                cache.remember(returned, key)
            require(found['size'] == len(content), 'Gitee attachment size mismatch')
            report['files'].append({'name': name, 'sha256': digest, 'size': len(content), 'reused': reused, 'mode': 'attachment'})
            write_json(destination, report)
            print('Gitee verified ' + name, flush=True)
        # Detect source changes during transfer instead of finalizing a mixed snapshot.
        after = [a for a in gh.pages(f'/repos/{gh_repo}/releases/{release["id"]}/assets')
                 if not a['name'].lower().endswith('.json')]
        require([(a['id'], a['name'], a['size'], a.get('updated_at')) for a in after] ==
                [(a['id'], a['name'], a['size'], a.get('updated_at')) for a in assets], 'GitHub attachments changed during sync')
        body = release['body'] or ''
        if links:
            body += '\n\n### 大文件下载（GitHub）\n\nGitee 单附件限制 100 MB，以下文件使用同版本 GitHub 原始下载链接：\n\n'
            for item in links:
                body += f'- [{item["name"]}]({item["url"]}) — {item["size"]} bytes；SHA256：`{item["sha256"]}`\n'
        api.request('PATCH', path + '/releases/' + str(current['id']), {'tag_name': version, 'name': release['name'],
                    'body': body, 'prerelease': False})
        final = api.request('GET', path + '/releases/' + str(current['id']))
        require(final['name'] == release['name'] and (final.get('body') or '') == body and
                not final['prerelease'], 'Gitee release metadata mismatch')
        report['status'] = 'success'
        return report
    except BaseException as error:
        report['status'], report['error_type'] = 'failed', type(error).__name__
        raise
    finally:
        write_json(destination, report)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--version')
    synchronize(parser.parse_args().version)
