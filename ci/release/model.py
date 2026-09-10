"""Release contracts shared by Jenkins, GitHub workers and publishers."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tarfile
import zipfile
from pathlib import Path


DOMAINS = {
    'web': ['web-x86', 'web-arm', 'dist-zip', 'dist-tar-gz'],
    'service': ['service-x86', 'service-arm', 'service-jvm-x86', 'service-jvm-arm', 'jar'],
    'desktop': ['appimage', 'rpm', 'snap', 'dmg', 'exe'],
    'android': ['apk-online', 'apk-local'],
}
TARGETS = [target for values in DOMAINS.values() for target in values]
IMAGE_TARGETS = {target for target in TARGETS if target.startswith(('web-', 'service-'))}
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.release'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def version_tuple(version):
    require(bool(re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version)),
            'Release version must be a stable major.minor.patch version')
    return tuple(map(int, version.split('.')))


def version_code(version):
    major, minor, patch = version_tuple(version)
    code = major * 1_000_000 + minor * 1_000 + patch
    require(minor < 1000 and patch < 1000 and 0 < code <= 2_100_000_000,
            'Version cannot be represented by the Android versionCode policy')
    return code


def identity(context):
    return {key: context.get(key) for key in ('version', 'source_sha', 'android_sha')}


def check_identity(expected, actual):
    for key, value in identity(expected).items():
        require(value == actual.get(key), f'Release identity mismatch: {key}')


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def env(name, default=None):
    value = os.environ.get(name, default)
    require(value is not None and str(value).strip(), f'Missing configuration: {name}')
    return value


def run(args, cwd=ROOT, capture=False, extra_env=None):
    # Argument arrays only: refs, notes and credentials never become shell code.
    process_env = os.environ.copy()
    process_env.update(extra_env or {})
    result = subprocess.run([str(a) for a in args], cwd=cwd, env=process_env,
                            check=True, text=True, encoding='utf-8',
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ''


def checked_relative(name):
    require(bool(name) and '\\' not in name and not name.startswith('/'), 'Unsafe artifact path')
    require(all(p not in ('', '.', '..') for p in name.split('/')), 'Unsafe artifact path')
    require(':' not in name, 'Unsafe artifact path')
    return name


def extract_zip(archive, destination):
    destination = Path(destination)
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            name = item.filename.rstrip('/')
            if name:
                checked_relative(name)
            require((item.external_attr >> 16) & 0o170000 != 0o120000, 'Artifact symlinks are forbidden')
        bundle.extractall(destination)


def pack_directory(directory, output, prefix='dist'):
    """Stable archive names, permissions and timestamps across retry attempts."""
    directory, output = Path(directory), Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    paths = sorted(p for p in directory.rglob('*') if p.is_file())
    require(paths, f'Nothing to archive in {directory}')
    if output.suffix == '.zip':
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
            for path in paths:
                info = zipfile.ZipInfo(f'{prefix}/{path.relative_to(directory).as_posix()}')
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                bundle.writestr(info, path.read_bytes())
    else:
        import gzip
        with output.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as bundle:
                for path in paths:
                    info = bundle.gettarinfo(str(path), f'{prefix}/{path.relative_to(directory).as_posix()}')
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ''
                    info.mode = 0o644
                    with path.open('rb') as stream:
                        bundle.addfile(info, stream)


def file_record(path, target):
    path = Path(path)
    return {'target': target, 'name': path.name, 'sha256': sha256(path), 'size': path.stat().st_size}


def image_arch(target):
    require(target in IMAGE_TARGETS, 'Not an image target')
    return 'arm64' if target.endswith('-arm') else 'amd64'


def image_names(target, registry):
    require(target in IMAGE_TARGETS, 'Not an image target')
    names = ['password-xl-' + target]
    if target.endswith('-x86'):
        names.append(names[0][:-4])
    if target == 'web-x86' and registry == 'tencent':
        names.append('password-xl-service-web')
    return names


def merge_results(context, results):
    merged = {'schema': 1, **identity(context), 'targets': [], 'files': [], 'images': [], 'worker_runs': []}
    for result in results:
        check_identity(context, result)
        require(result.get('status') == 'success', 'A selected domain has not succeeded')
        for key in ('targets', 'files', 'images', 'worker_runs'):
            merged[key].extend(result.get(key, []))
    require(len(merged['targets']) == len(set(merged['targets'])), 'Duplicate target results')
    require(set(merged['targets']) == set(context['targets']), 'Selected target results are incomplete')
    require(len({f['name'] for f in merged['files']}) == len(merged['files']), 'Duplicate asset names')
    merged['status'] = 'success'
    return merged
