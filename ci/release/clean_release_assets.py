"""One-time migration of legacy public JSON assets into verified internal records."""
import argparse
import hashlib
import json

from api import Api
from gitee_release import Gitee
from model import OUT, env, read_json, require, write_json
from publish import Release
from release_records import Records
import urllib.parse


def migrate_json(store, name, content, remove):
    value = json.loads(content)
    store.put(name, value)
    require(store.get(name) == value, 'Internal record readback mismatch; public attachment retained')
    remove()
    return {'name': name, 'sha256': hashlib.sha256(content).hexdigest(), 'status': 'migrated'}


def clean(providers=('github', 'gitea', 'gitee')):
    audit = OUT / 'public-json-cleanup.json'
    report = read_json(audit) if audit.exists() else []
    for provider in providers:
        github = provider == 'github'
        api = Gitee() if provider == 'gitee' else Api(
            'https://api.github.com' if github else env('GITEA_URL') + '/api/v1',
            env('GH_TOKEN' if github else 'GITEA_TOKEN'), github)
        repo = (urllib.parse.urlsplit(env('GITEE_URL')).path.strip('/').removesuffix('.git')
                if provider == 'gitee' else env('GITHUB_REPO' if github else 'GITEA_REPO'))
        path = '/repos/' + repo
        for release in api.pages(path + '/releases'):
            assets_path = f'{path}/releases/{release["id"]}/' + ('attach_files' if provider == 'gitee' else 'assets')
            assets = api.pages(assets_path)
            record = {'provider': provider, 'version': release['tag_name'], 'files': []}
            report.append(record)
            # Construct an existing-release view without creating releases or reserving new source.
            endpoint = Release.__new__(Release)
            endpoint.provider, endpoint.github, endpoint.api, endpoint.repo = provider, github, api, repo
            endpoint.path, endpoint.release, endpoint.assets_path = path, release, assets_path
            endpoint._assets, endpoint._contents = {a['name']: a for a in assets}, {}
            store = Records(provider, release['tag_name'])
            for asset in assets:
                if not asset['name'].lower().endswith('.json'):
                    continue
                content = (api.request('GET', assets_path + '/' + str(asset['id']) + '/download', binary=True)
                           if provider == 'gitee' else endpoint.content(asset))
                delete_path = (path + '/releases/assets/' + str(asset['id']) if github
                               else assets_path + '/' + str(asset['id']))
                record['files'].append(migrate_json(store, asset['name'], content,
                    lambda: api.request('DELETE', delete_path)))
                write_json(audit, report)
            if provider != 'gitee' and 'SHA256SUMS' in endpoint.assets():
                original = endpoint.content(endpoint.assets()['SHA256SUMS']).decode('utf-8')
                cleaned = ''.join(line + '\n' for line in original.splitlines()
                                  if not line.lower().endswith('.json'))
                if cleaned != original:
                    output = OUT / 'metadata' / 'SHA256SUMS'
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_text(cleaned, encoding='utf-8')
                    endpoint.put(output, mutable=True)
            body = release.get('body') or ''
            updated = body.replace('See release-manifest.json and SHA256SUMS for provenance and checksums.',
                                   'See SHA256SUMS for download checksums. Build provenance is retained in Jenkins and the internal records store.')
            if body != updated:
                data = {'body': updated}
                if provider == 'gitee':
                    data.update(tag_name=release['tag_name'], name=release['name'], prerelease=release['prerelease'])
                api.request('PATCH', path + '/releases/' + str(release['id']), data)
            require(not any(a['name'].lower().endswith('.json') for a in api.pages(assets_path)),
                    'Public JSON attachments remain after migration')
            print(provider + ' ' + release['tag_name'] + ': removed ' + str(len(record['files'])) + ' JSON attachments', flush=True)
            write_json(audit, report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True)
    parser.parse_args()
    clean()
