#!/usr/bin/env python3
"""One CLI for Jenkins domains, the coordinator, and explicitly dispatched workers."""
import argparse
import base64
import json
import os
import shutil
import sys
from pathlib import Path

import builds
import publish
import registry
import source
import workers
from model import (DOMAINS, IMAGE_TARGETS, OUT, ROOT, check_identity, checked_relative, env,
                   extract_zip, identity, merge_results, pack_directory, read_json, require, run,
                   sha256, write_json)


def auth():
    auths = {}
    for name in registry.REGISTRIES:
        prefix = registry.prefix(name)
        if name == 'private' and env('REGISTRY_PRIVATE_ANONYMOUS', 'false') == 'true':
            continue
        user, password = env('REGISTRY_' + name.upper() + '_USERNAME'), env('REGISTRY_' + name.upper() + '_PASSWORD')
        host = prefix.split('/')[0]
        auths[host] = {'auth': base64.b64encode((user + ':' + password).encode()).decode()}
    path = OUT / 'private/docker/config.json'
    write_json(path, {'auths': auths})
    path.chmod(0o600)
    os.environ['REGISTRY_AUTH_FILE'] = str(path)
    os.environ['DOCKER_CONFIG'] = str(path.parent)


def bundle_frontend(context):
    if context['deploy_oss'] or any(t in DOMAINS['web'] + DOMAINS['service'] for t in context['targets']):
        dist = builds.frontend(context)
        pack_directory(dist, OUT / 'frontend.zip', 'dist-web')
        for endpoint in publish.releases(context):
            endpoint.put(OUT / 'frontend.zip')


def reserve(context):
    if context['deploy_oss']:
        from oss import preflight
        preflight()  # Reject missing settings or access before any publication.
    source.synchronize(context)
    publish.releases(context)


def consume_worker(context, task, targets, **extra):
    if task == 'native-arm' and (OUT / 'frontend.zip').exists():
        extra['frontend_sha256'] = sha256(OUT / 'frontend.zip')
        endpoint = publish.Release('github', context)
        asset = endpoint.assets().get('frontend.zip')
        require(asset, 'Shared frontend release asset is missing')
        extra['frontend_asset_id'] = asset['id']
    result, directory, record = workers.dispatch(context, task, targets, **extra)
    files = []
    for item in result.get('files', []):
        require(item['target'] in targets and item['name'] == Path(item['path']).name, 'Invalid worker file name')
        output = OUT / 'files' / checked_relative(item['name'])
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(directory / item['path'], output)
        files.append({key: value for key, value in item.items() if key != 'path'})
    return result, directory, record, files


def domain(context, name):
    targets = [t for t in context['targets'] if t in DOMAINS[name]]
    require(targets, 'Domain has no selected targets')
    if (OUT / 'frontend.zip').exists():
        extract_zip(OUT / 'frontend.zip', OUT)
    result = {'schema': 1, **identity(context), 'targets': [], 'files': [], 'images': [], 'worker_runs': [],
              'status': 'running', 'domain': name}
    path = OUT / ('result-' + name + '.json')
    try:
        cached = {target: publish.restore_target(context, target, OUT / 'files') for target in targets}
        if name in ('desktop', 'android'):
            groups = ({'android': DOMAINS['android']} if name == 'android' else
                      {'desktop-linux': ['appimage', 'rpm', 'snap'], 'desktop-macos': ['dmg'], 'desktop-windows': ['exe']})
            for task, group in groups.items():
                pending = [target for target in targets if target in group and not cached[target]]
                if not pending:
                    continue
                _, _, record, built_files = consume_worker(context, task, pending)
                require(sorted(f['target'] for f in built_files) == sorted(pending), 'Worker file target coverage mismatch')
                for target in pending:
                    files = [file for file in built_files if file['target'] == target]
                    publish.save_checkpoint(context, target, files, [], [record])
                    cached[target] = publish.target_receipt(context, target, files, [], [record])
        for target in targets:
            receipt = cached[target]
            if receipt:
                for image in receipt['images']:
                    registry.distribute(image, context)
                # Also repairs a one-provider upload failure without rebuilding signed/randomized bytes.
                publish.publish_target(context, target, receipt['files'], receipt['images'], receipt['worker_runs'])
                files, images, runs = receipt['files'], receipt['images'], receipt['worker_runs']
            else:
                files, images, runs = [], [], []
                if target in IMAGE_TARGETS:
                    if target == 'service-arm':
                        worker, directory, record, _ = consume_worker(context, 'native-arm', [target])
                        require(len(worker['archives']) == 1, 'Native worker must return one image')
                        archive = worker['archives'][0]
                        image = registry.stage('docker-archive:' + str(directory / archive['path']), context, target)
                        require(worker.get('verified_images') == [target], 'Native image was not verified')
                        runs.append(record)
                    else:
                        archive_ref = builds.build_local(context, target)
                        image = registry.stage(archive_ref, context, target)
                        worker, _, record, _ = consume_worker(context, 'smoke-' + image['arch'], [target],
                                                              image=image['worker_source'])
                        require(worker.get('verified_images') == [target], 'Image was not verified')
                        runs.append(record)
                    images.append(image)
                else:
                    files.append(builds.build_local(context, target))
                publish.save_checkpoint(context, target, files, images, runs)
                for image in images:
                    registry.distribute(image, context)
                publish.publish_target(context, target, files, images, runs)
            result['targets'].append(target)
            result['files'].extend(files)
            result['images'].extend(images)
            result['worker_runs'].extend(runs)
            write_json(path, result)
        if name == 'web' and context['deploy_oss']:
            builds.frontend(context)
        result['status'] = 'success'
        return result
    except BaseException as error:
        result['status'] = 'failed'
        result['error_type'] = type(error).__name__
        raise
    finally:
        write_json(path, result)


def finalize(context):
    results = [read_json(path) for path in sorted(OUT.glob('result-*.json'))]
    merged = merge_results(context, results)
    endpoints, manifest = publish.combined_manifest(context, merged)
    state = {'schema': 1, **identity(context), 'status': 'finalizing', 'steps': {}}
    path = OUT / 'publication.json'
    try:
        if context['update_latest']:
            state['steps']['latest'] = []
            for image in merged['images']:
                state['steps']['latest'].extend(registry.promote_latest(image, context))
                write_json(path, state)
        if context['deploy_oss']:
            from oss import deploy
            state['steps']['oss'] = deploy(context, OUT / 'dist-web')
            write_json(path, state)
        for endpoint in endpoints:
            endpoint.finish(manifest, context.get('release_notes'))
            state['steps'][endpoint.provider] = 'public'
            write_json(path, state)
        state['status'] = 'success'
    except BaseException as error:
        state['status'] = 'partial-failure'
        state['error_type'] = type(error).__name__
        raise
    finally:
        write_json(path, state)
        # This report records non-atomic effects, including partial failures, on both sites.
        errors = []
        for endpoint in endpoints:
            try:
                endpoint.put(path, mutable=True)
            except Exception as error:
                errors.append(type(error).__name__)
        if errors:
            state['status'] = 'partial-failure'
            state['report_errors'] = errors
            write_json(path, state)
            # Repair any provider that previously received a success report. Never mask
            # the failed publication with an optimistic local status.
            for endpoint in endpoints:
                try:
                    endpoint.put(path, mutable=True)
                except Exception:
                    pass
        require(not errors, 'Publication status could not be saved to both releases: ' + ', '.join(errors))


def worker():
    context = json.loads(env('WORKER_PAYLOAD'))
    require(context['source_sha'] == run(['git', 'rev-parse', 'HEAD'], capture=True), 'Worker checkout SHA mismatch')
    require(read_json(ROOT / 'password-xl-web/package.json')['version'] == context['version'], 'Worker version mismatch')
    require(context['request_id'] == env('WORKER_REQUEST_ID'), 'Worker request mismatch')
    targets, task = context['targets'], context['task']
    result = {'schema': 1, **identity(context), 'request_id': context['request_id'], 'targets': targets,
              'files': [], 'archives': [], 'verified_images': [], 'status': 'running'}
    output = OUT / 'worker'
    output.mkdir(parents=True, exist_ok=True)
    try:
        if task.startswith('desktop-'):
            allowed = {'desktop-linux': ['appimage', 'rpm', 'snap'], 'desktop-macos': ['dmg'], 'desktop-windows': ['exe']}
            require(task in allowed and set(targets) <= set(allowed[task]), 'Invalid desktop request')
            result['files'] = builds.desktop(context, targets)
        elif task == 'native-arm':
            require(targets == ['service-arm'], 'Invalid native worker request')
            if context.get('validation_only'):
                # Internal integration checks run before reserving an immutable release tag.
                builds.frontend(context)
            else:
                from api import Api
                api = Api('https://api.github.com', env('GH_WORKER_TOKEN'), True)
                repo_path = '/repos/' + env('GITHUB_REPO')
                api.download(repo_path + '/releases/assets/' + str(int(context['frontend_asset_id'])), OUT / 'frontend.zip',
                             headers={'Accept': 'application/octet-stream'})
                require(sha256(OUT / 'frontend.zip') == context['frontend_sha256'], 'Shared frontend checksum mismatch')
                extract_zip(OUT / 'frontend.zip', OUT)
            builds.gradle(context, ['build', 'nativeCompile'])
            reference = builds.dockerfile_image(context, targets[0], cloud=True)
            archive = Path(reference.removeprefix('docker-archive:'))
            run(['docker', 'load', '-i', str(archive)])
            from smoke import check_image
            check_image('password-xl-worker:service-arm', context, targets[0])
            result['verified_images'] = targets
            result['archives'] = [{'target': targets[0], 'path': 'images/' + archive.name, 'sha256': sha256(archive)}]
        elif task in ('smoke-amd64', 'smoke-arm64'):
            require(len(targets) == 1 and targets[0] in IMAGE_TARGETS, 'Invalid smoke request')
            image = context['image']
            allowed = os.environ.get('REGISTRY_WORKER_PREFIX') or env('REGISTRY_PRIVATE_PREFIX')
            require('@sha256:' in image and image.startswith(allowed + '/'), 'Invalid image source')
            docker_auth = OUT / 'private/worker-docker'
            docker_auth.mkdir(parents=True, exist_ok=True)
            auths = {}
            if env('REGISTRY_WORKER_ANONYMOUS', 'false') != 'true':
                auths[image.split('/')[0]] = {'auth': base64.b64encode(
                    (env('REGISTRY_WORKER_USERNAME') + ':' + env('REGISTRY_WORKER_PASSWORD')).encode()).decode()}
            write_json(docker_auth / 'config.json', {'auths': auths})
            os.environ['DOCKER_CONFIG'] = str(docker_auth)
            run(['docker', 'pull', image])
            from smoke import check_image
            check_image(image, context, targets[0])
            result['verified_images'] = targets
        elif task == 'android':
            require(set(targets) <= set(DOMAINS['android']), 'Invalid Android request')
            from android import build
            result['files'] = build(context, targets)
        else:
            raise ValueError('Unknown worker task')
        for item in result['files'] + result['archives']:
            destination = output / checked_relative(item['path'])
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(OUT / item['path'], destination)
        result['status'] = 'success'
    finally:
        write_json(output / 'result.json', result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['prepare', 'checkout', 'reserve', 'frontend', 'domain', 'draft', 'finalize', 'worker', 'cancel', 'rollback-oss'])
    parser.add_argument('--domain', choices=['all', *DOMAINS], default='all')
    parser.add_argument('--deployment')
    args = parser.parse_args()
    if args.command == 'worker':
        return worker()
    if args.command == 'cancel':
        return workers.cancel_all()
    if args.command == 'prepare':
        return source.prepare(args.domain)
    if args.command == 'rollback-oss':
        from oss import rollback
        return rollback(args.deployment)
    context = read_json(OUT / 'context.json')
    if args.command == 'checkout':
        sha = source.pin(env('GITEA_SOURCE_URL'), context['source_sha'], env('GITEA_TOKEN'))
        require(sha == context['source_sha'], 'Pinned checkout could not be obtained')
        return source.git(['checkout', '--detach', sha], env('GITEA_TOKEN'))
    require(run(['git', 'rev-parse', 'HEAD'], capture=True) == context['source_sha'], 'Jenkins checkout SHA mismatch')
    if args.command == 'reserve':
        return reserve(context)
    if args.command == 'frontend':
        return bundle_frontend(context)
    if args.command == 'draft':
        results = [read_json(path) for path in sorted(OUT.glob('result-*.json'))]
        return publish.combined_manifest(context, merge_results(context, results))
    relevant = DOMAINS[args.domain] if args.command == 'domain' else context['targets']
    if any(t in IMAGE_TARGETS and t in relevant for t in context['targets']):
        auth()
    if args.command == 'domain':
        return domain(context, args.domain)
    return finalize(context)


if __name__ == '__main__':
    main()
