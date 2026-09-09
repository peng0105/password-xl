"""Small HTTP client; never forward Authorization across a redirect."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from model import require


class ApiError(RuntimeError):
    def __init__(self, status, method, url):
        self.status = status
        # No response bodies, query strings, credentials or signed URLs in logs.
        super().__init__(f'HTTP {status}: {method} {urllib.parse.urlsplit(url).path}')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Api:
    def __init__(self, base, token, github=False):
        self.base = base.rstrip('/')
        require(self.base.startswith('https://'), 'Release APIs require HTTPS')
        self.token = token
        self.github = github

    def request(self, method, path, data=None, headers=None, binary=False):
        url = path if path.startswith('https://') else self.base + path
        require(urllib.parse.urlsplit(url).netloc == urllib.parse.urlsplit(self.base).netloc,
                'Authenticated API request cannot change hosts')
        request_headers = {'Authorization': ('Bearer ' if self.github else 'token ') + self.token,
                           'Accept': 'application/vnd.github+json' if self.github else 'application/json',
                           'User-Agent': 'password-xl-release'}
        if self.github:
            request_headers['X-GitHub-Api-Version'] = '2026-03-10'
        if data is not None and not isinstance(data, bytes):
            data = json.dumps(data).encode()
            request_headers['Content-Type'] = 'application/json'
        request_headers.update(headers or {})
        for attempt in range(4):
            try:
                request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
                with urllib.request.build_opener(NoRedirect).open(request, timeout=120) as response:
                    body = response.read()
                    return body if binary else (json.loads(body) if body else None)
            except urllib.error.HTTPError as error:
                if error.code in (301, 302, 303, 307, 308) and method == 'GET' and binary:
                    # GitHub artifact/asset downloads redirect to object storage. Strip all auth.
                    location = error.headers.get('Location', '')
                    require(location.startswith('https://'), 'Unsafe download redirect')
                    with urllib.request.urlopen(location, timeout=120) as response:
                        return response.read()
                if method == 'GET' and (error.code == 429 or error.code >= 500) and attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise ApiError(error.code, method, url) from None

    def maybe(self, path):
        try:
            return self.request('GET', path)
        except ApiError as error:
            if error.status == 404:
                return None
            raise

    def pages(self, path, key=None):
        values = []
        for page in range(1, 1001):
            separator = '&' if '?' in path else '?'
            result = self.request('GET', f'{path}{separator}per_page=100&limit=100&page={page}')
            batch = result[key] if key else result
            values.extend(batch)
            if len(batch) < 100:
                return values
        raise ValueError('API pagination limit exceeded')

    def download(self, path, destination, headers=None):
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(self.request('GET', path, headers=headers, binary=True))
