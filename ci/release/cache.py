"""CI-only content cache and proofs for previously downloaded immutable asset IDs.

The cache never decides which source/version to publish. Fresh Release metadata and
matching source receipts do that; cached file bytes are always hashed on restore.
"""
import hashlib
import json
import os
import re
import time
import uuid
from pathlib import Path

from model import require


def root():
    value = os.environ.get('RELEASE_CACHE_ROOT')
    return Path(value) if value else None


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_bytes(data)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def asset_key(base, repo, release_id, asset):
    # Gitea attachment bytes are replaced by delete+upload (new ID/UUID), not PATCH.
    # Exclude download_count, which changes on reads without changing file contents.
    if not all(asset.get(k) is not None for k in ('id', 'name', 'size', 'created_at')):
        return None
    value = [base, repo, release_id, {k: asset.get(k) for k in
             ('id', 'uuid', 'name', 'size', 'created_at', 'updated_at', 'digest')}]
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def known_digest(key):
    directory = root()
    if not directory or not key:
        return None
    path = directory / 'verified-assets' / (key + '.json')
    try:
        value = json.loads(path.read_text())
        if re.fullmatch('[0-9a-f]{64}', value.get('sha256', '')):
            return value['sha256']
    except (OSError, ValueError):
        pass
    return None


def remember(data, key=None):
    digest = hashlib.sha256(data).hexdigest()
    directory = root()
    if directory:
        try:
            path = directory / 'blobs' / digest
            if not path.exists():
                atomic_write(path, data)
            if key:
                atomic_write(directory / 'verified-assets' / (key + '.json'),
                             json.dumps({'sha256': digest, 'size': len(data)}).encode())
            prune()
        except OSError:
            print('Artifact cache write unavailable; continuing with verified source bytes', flush=True)
    return digest


def load(digest):
    require(bool(re.fullmatch('[0-9a-f]{64}', digest)), 'Invalid cache checksum')
    directory = root()
    if not directory:
        return None
    path = directory / 'blobs' / digest
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if hashlib.sha256(data).hexdigest() != digest:
        # A corrupt cache entry is a miss, never accepted as a published artifact.
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return None
    try:
        os.utime(path, None)
    except OSError:
        pass  # A concurrent pruning process may remove the already-read cache file.
    return data


def prune():
    """Keep recently used entries; only this application's named cache directories."""
    directory = root()
    if not directory:
        return
    cutoff = time.time() - 30 * 86400
    blobs = []
    for child in ('blobs', 'verified-assets'):
        folder = directory / child
        if not folder.is_dir() or folder.is_symlink() or not folder.resolve().is_relative_to(directory.resolve()):
            continue
        try:
            entries = list(folder.iterdir())
        except OSError:
            continue
        for path in entries:
            if path.is_symlink() or not path.is_file():
                continue
            if not re.fullmatch(r'[0-9a-f]{64}(?:\.json)?', path.name):
                continue
            try:
                stat = path.stat()
                if stat.st_mtime < cutoff:
                    path.unlink()
                elif child == 'blobs':
                    blobs.append((stat.st_mtime, stat.st_size, path))
            except OSError:
                pass
    # Bound this application's share of the existing PVC; Gradle/Yarn directories are untouched.
    maximum = int(os.environ.get('RELEASE_CACHE_MAX_BYTES', str(3 * 1024**3)))
    total = sum(size for _, size, _ in blobs)
    for _, size, path in sorted(blobs):
        if total <= maximum:
            break
        try:
            path.unlink(missing_ok=True)
            total -= size
        except OSError:
            pass
