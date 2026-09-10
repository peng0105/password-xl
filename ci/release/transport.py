"""Temporary worker inputs, separate from Releases, Git branches and image registries."""
import re
from pathlib import Path

from api import Api, ApiError
from model import OUT, env, require, sha256

PACKAGE = 'password-xl-ci-input'


def client():
    return Api(env('GITEA_URL'), env('GITEA_TOKEN'))


def package_path(request_id):
    require(bool(re.fullmatch('[0-9a-f]{32}', request_id)), 'Invalid input package ID')
    owner = env('GITEA_REPO').split('/')[0]
    require(bool(re.fullmatch('[A-Za-z0-9_.-]+', owner)), 'Invalid package owner')
    return f'/api/packages/{owner}/generic/{PACKAGE}/{request_id}'


def upload(request_id, files):
    api = client()
    entries = []
    for path in files:
        path = Path(path)
        require(bool(re.fullmatch('[A-Za-z0-9_.-]+', path.name)), 'Invalid worker input name')
        api.request('PUT', package_path(request_id) + '/' + path.name, path.read_bytes(),
                    {'Content-Type': 'application/octet-stream'}, binary=True)
        entries.append({'name': path.name, 'sha256': sha256(path), 'size': path.stat().st_size})
    return entries


def download(context, name, destination):
    entries = [item for item in context.get('inputs', []) if item['name'] == name]
    require(len(entries) == 1 and re.fullmatch('[A-Za-z0-9_.-]+', name), 'Worker input missing or ambiguous')
    client().download(package_path(context['request_id']) + '/' + name, destination)
    entry = entries[0]
    require(Path(destination).stat().st_size == entry['size'] and sha256(destination) == entry['sha256'],
            'Worker input checksum mismatch')


def cleanup(record):
    if not record.get('input_package'):
        return
    require(record['input_package'] == record['request_id'], 'Input cleanup identity mismatch')
    try:
        client().request('DELETE', package_path(record['request_id']))
    except ApiError as error:
        if error.status != 404:
            raise
