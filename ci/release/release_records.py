"""Release bookkeeping in Gitea packages, separate from public download assets."""
import json
import re
import urllib.parse
import uuid

from api import Api, ApiError
from model import env, require

MUTABLE = {'publication.json', 'release-manifest.json'}


class Records:
    def __init__(self, provider, version):
        require(provider in ('github', 'gitea', 'gitee'), 'Unknown release provider')
        self.provider = provider
        self.api = Api(env('GITEA_URL'), env('GITEA_TOKEN'))
        owner = urllib.parse.quote(env('GITEA_REPO').split('/')[0], safe='')
        version = urllib.parse.quote(version, safe='')
        package = 'password-xl-release-records'
        self.path = f'/api/packages/{owner}/generic/{package}/{version}/'
        self.files = f'/api/v1/packages/{owner}/generic/{package}/{version}/files'

    def filename(self, name):
        require(re.fullmatch(r'[a-zA-Z0-9_-]+\.json', name), 'Unsafe record name')
        return self.provider + '-' + name

    def get(self, name):
        filename = self.filename(name)
        if name in MUTABLE:
            try:
                files = self.api.pages(self.files)
            except ApiError as error:
                if error.status != 404:
                    raise
                files = []
            prefix = filename[:-5] + '.rev-'
            matches = [f for f in files if f['name'].startswith(prefix) and f['name'].endswith('.json')]
            if not matches:
                return None
            # Package file IDs are allocated by the server, avoiding client clock skew.
            filename = max(matches, key=lambda f: int(f['id']))['name']
        return self.api.maybe(self.path + filename)

    def put(self, name, value):
        existing = self.get(name)
        if existing == value:
            return
        require(existing is None or name in MUTABLE, 'Immutable release record conflict: ' + name)
        filename = self.filename(name)
        if name in MUTABLE:
            filename = filename[:-5] + '.rev-' + uuid.uuid4().hex + '.json'
        path = self.path + filename
        content = json.dumps(value, ensure_ascii=False, sort_keys=True).encode('utf-8')
        try:
            self.api.request('PUT', path, content, {'Content-Type': 'application/octet-stream'}, binary=True)
        except ApiError as error:
            if error.status != 409:
                raise
        # Verify the exact uploaded revision before allowing legacy assets to be deleted.
        require(self.api.maybe(path) == value, 'Release record storage verification failed: ' + name)
