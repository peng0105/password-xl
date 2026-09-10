"""Digest-preserving distribution; immutable version tags, guarded latest tags."""
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

from model import OUT, env, image_arch, image_names, require, run, version_tuple


REGISTRIES = ('private', 'dockerhub', 'tencent')


def prefix(registry):
    value = env('REGISTRY_' + registry.upper() + '_PREFIX').rstrip('/')
    require('://' not in value and '@' not in value and ' ' not in value, 'Invalid registry prefix')
    return value


def inspect(reference, optional=False):
    try:
        return json.loads(run(['skopeo', 'inspect', '--authfile', env('REGISTRY_AUTH_FILE'), reference], capture=True))
    except subprocess.CalledProcessError:
        if optional:
            # Probe the tag list as well: authentication/network errors must not be treated as absence.
            require(reference.startswith('docker://') and ':' in reference.rsplit('/', 1)[-1],
                    'Only tagged registry images can be optional')
            repository, tag = reference[9:].rsplit(':', 1)
            tags = json.loads(run(['skopeo', 'list-tags', '--authfile', env('REGISTRY_AUTH_FILE'),
                                   'docker://' + repository], capture=True))
            if tag not in (tags.get('Tags') or []):
                return None
        raise


def validate(info, context, target):
    require(info['Architecture'] == image_arch(target) and info['Os'] == 'linux', 'Wrong image platform')
    labels = info.get('Labels') or {}
    require(labels.get('org.opencontainers.image.revision') == context['source_sha'], 'Wrong image source revision')
    require(labels.get('org.opencontainers.image.version') == context['version'], 'Wrong image version')


def copy(source, destination):
    run(['skopeo', 'copy', '--all', '--preserve-digests', '--authfile', env('REGISTRY_AUTH_FILE'),
         source, 'docker://' + destination])


def stage(archive_reference, context, target):
    # Docker/Jib archives may contain uncompressed layers. Normalize once before choosing
    # the canonical digest; distribution after this point always preserves those exact bytes.
    normalized = OUT / 'images' / ('normalized-' + target)
    normalized.mkdir(parents=True, exist_ok=True)
    run(['skopeo', '--override-os', 'linux', '--override-arch', image_arch(target),
         'copy', '--format', 'v2s2', '--dest-compress', '--authfile', env('REGISTRY_AUTH_FILE'),
         archive_reference, 'dir:' + str(normalized)])
    archive_reference = 'dir:' + str(normalized)
    info = inspect(archive_reference)
    validate(info, context, target)
    repository = prefix('private') + '/' + image_names(target, 'private')[0]
    candidate = repository + ':ci-' + context['version'] + '-' + context['source_sha'][:12]
    # A repository might not exist on its first publication; list-tags cannot distinguish that
    # reliably on every registry. Always copy to a content-addressed candidate instead.
    candidate += '-' + info['Digest'].split(':')[1][:12]
    copy(archive_reference, candidate)
    actual = inspect('docker://' + candidate)
    require(actual['Digest'] == info['Digest'], 'Staging changed the image digest')
    source = repository + '@' + info['Digest']
    worker_source = source
    worker_prefix = os.environ.get('REGISTRY_WORKER_PREFIX', prefix('private')).rstrip('/')
    if worker_prefix != prefix('private'):
        require(worker_prefix in (prefix('dockerhub'), prefix('tencent')), 'Worker staging must use a configured release registry')
        worker_repository = worker_prefix + '/' + image_names(target, 'private')[0]
        worker_candidate = worker_repository + ':' + candidate.rsplit(':', 1)[1]
        copy('docker://' + source, worker_candidate)
        require(inspect('docker://' + worker_candidate)['Digest'] == info['Digest'], 'Worker staging changed image digest')
        worker_source = worker_repository + '@' + info['Digest']
    return {'target': target, 'arch': image_arch(target), 'digest': info['Digest'],
            'source': source, 'worker_source': worker_source, 'destinations': []}


def optional_tag(reference):
    # manifest-unknown is the only absence result accepted; never mask denied or timeouts.
    args = ['skopeo', 'inspect', '--authfile', env('REGISTRY_AUTH_FILE'), 'docker://' + reference]
    result = subprocess.run(args, text=True, encoding='utf-8', stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode == 0:
        return json.loads(result.stdout)
    error = result.stderr.lower()
    if any(marker in error for marker in ('manifest unknown', 'manifest_unknown', 'name unknown', 'name_unknown')):
        return None
    raise RuntimeError('Registry inspection failed; verify connectivity, repository access and authentication')


def distribute(record, context):
    validate(inspect('docker://' + record['source']), context, record['target'])
    def distribute_registry(registry):
        destinations = []
        source = record['source']
        for name in image_names(record['target'], registry):
            destination = f'{prefix(registry)}/{name}:{context["version"]}'
            existing = optional_tag(destination)
            if existing:
                require(existing['Digest'] == record['digest'], f'Immutable image tag conflict: {destination}')
                actual = existing
            else:
                copy('docker://' + source, destination)
                actual = inspect('docker://' + destination)
            validate(actual, context, record['target'])
            require(actual['Digest'] == record['digest'], 'Registry digest mismatch')
            destinations.append(destination)
            # Subsequent compatibility names can mount blobs within the destination registry.
            source = destination.rsplit(':', 1)[0] + '@' + record['digest']
        return destinations
    with ThreadPoolExecutor(max_workers=3) as pool:
        destinations = [item for group in pool.map(distribute_registry, REGISTRIES) for item in group]
    record['destinations'] = destinations
    return record


def promote_latest(record, context):
    updates = []
    for destination in record['destinations']:
        latest = destination.rsplit(':', 1)[0] + ':latest'
        existing = optional_tag(latest)
        if existing and existing.get('Digest') == record['digest']:
            updates.append({'image': latest, 'status': 'unchanged'})
            continue
        if existing:
            previous_version = (existing.get('Labels') or {}).get('org.opencontainers.image.version')
            if not previous_version:
                # An unlabelled legacy image has no reliable ordering. Preserve it
                # until the migration configuration states its known release version.
                previous_version = os.environ.get('LEGACY_LATEST_VERSION')
                if not previous_version:
                    updates.append({'image': latest, 'status': 'kept-unversioned-legacy'})
                    continue
            if previous_version and version_tuple(previous_version) > version_tuple(context['version']):
                updates.append({'image': latest, 'status': 'kept-newer-version'})
                continue
        # The version in this very repository was verified by distribute(). No WAN layer round-trip.
        copy('docker://' + destination.rsplit(':', 1)[0] + '@' + record['digest'], latest)
        require(inspect('docker://' + latest)['Digest'] == record['digest'], 'latest digest mismatch')
        updates.append({'image': latest, 'status': 'updated'})
    return updates
