#!/usr/bin/env python3
"""One CLI for Jenkins domains, the coordinator, and explicitly dispatched workers."""
import argparse
import base64
import json
import os
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import builds
import cache
import image_state
import publish
import registry
import source
import workers
import transport
from model import (DOMAINS, IMAGE_TARGETS, OUT, ROOT, check_identity, checked_relative, enabled, env,
                   extract_zip, identity, merge_results, pack_directory, read_json, require, run,
                   sha256, write_json)


def auth(push=True):
    auths = {}
    for name in registry.REGISTRIES if push else []:
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
        endpoints = publish.releases(context)
        for endpoint in sorted(endpoints, key=lambda item: item.provider != 'gitea'):
            asset = endpoint.assets().get('frontend.zip')
            if asset:
                (OUT / 'frontend.zip').write_bytes(endpoint.content(asset))
                extract_zip(OUT / 'frontend.zip', OUT)
                check = read_json(OUT / 'dist-web/release.json')
                require(check == {k: context[k] for k in ('version', 'source_sha')}, 'Cached frontend source mismatch')
                for destination in endpoints:
                    destination.put(OUT / 'frontend.zip')
                print('Reused the verified frontend archive', flush=True)
                return
        dist = builds.frontend(context)
        pack_directory(dist, OUT / 'frontend.zip', 'dist-web')
        for endpoint in endpoints:
            endpoint.put(OUT / 'frontend.zip')


def reserve(context):
    if context['deploy_oss']:
        from oss import preflight
        preflight()  # Reject missing settings or access before any publication.
    if enabled(context, 'publish_release'):
        image_state.check_source(context)  # A previous image-only publication also owns this version.
        source.synchronize(context)  # Release tags; master mirroring is independently controlled.
        publish.releases(context)
    if enabled(context, 'push_images') and any(t in IMAGE_TARGETS for t in context['targets']):
        source.check_primary_version(context)
        image_state.reserve(context)


def consume_worker(context, task, targets, cancel_event=None, **extra):
    if task == 'native-arm' and (OUT / 'frontend.zip').exists():
        extra['input_files'] = [OUT / 'frontend.zip']
    result, directory, record = workers.dispatch(context, task, targets, cancel_event=cancel_event, **extra)
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
    started = time.monotonic()
    stop = threading.Event()
    pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix='release-worker')
    try:
        endpoints = publish.releases(context)
        cached = {target: publish.restore_target(context, target, OUT / 'files', endpoints) for target in targets}
        arm = None
        if name == 'service' and 'service-arm' in targets and not cached['service-arm']:
            arm = pool.submit(consume_worker, context, 'native-arm', ['service-arm'], cancel_event=stop)
        if name in ('desktop', 'android'):
            groups = ({'android': DOMAINS['android']} if name == 'android' else
                      {'desktop-linux': ['appimage', 'rpm', 'snap'], 'desktop-macos': ['dmg'], 'desktop-windows': ['exe']})
            pending_workers = {}
            for task, group in groups.items():
                pending = [target for target in targets if target in group and not cached[target]]
                if not pending:
                    continue
                future = pool.submit(consume_worker, context, task, pending, cancel_event=stop)
                pending_workers[future] = pending
            for future in as_completed(pending_workers):
                pending = pending_workers[future]
                _, _, record, built_files = future.result()
                require(sorted(f['target'] for f in built_files) == sorted(pending), 'Worker file target coverage mismatch')
                for target in pending:
                    files = [file for file in built_files if file['target'] == target]
                    publish.save_checkpoint(context, target, files, [], [record], endpoints)
                    cached[target] = publish.target_receipt(context, target, files, [], [record])
        for target in targets:
            print(f'{name}: verify and publish {target}', flush=True)
            receipt = cached[target]
            if receipt:
                for image in receipt['images']:
                    registry.distribute(image, context)
                # Also repairs a one-provider upload failure without rebuilding signed/randomized bytes.
                publish.publish_target(context, target, receipt['files'], receipt['images'], receipt['worker_runs'], endpoints)
                files, images, runs = receipt['files'], receipt['images'], receipt['worker_runs']
            else:
                files, images, runs = [], [], []
                if target in IMAGE_TARGETS:
                    if target == 'service-arm':
                        worker, directory, record, _ = arm.result()
                        require(len(worker['archives']) == 1, 'Native worker must return one image')
                        archive = worker['archives'][0]
                        image = registry.stage('docker-archive:' + str(directory / archive['path']), context, target)
                        require(worker.get('verified_images') == [target], 'Native image was not verified')
                        runs.append(record)
                    else:
                        archive_ref = builds.build_local(context, target)
                        image = registry.stage(archive_ref, context, target)
                        inputs = ({'image': image['worker_source']} if image['worker_source'] else
                                  {'input_files': [registry.worker_archive(image)], 'image_config': image['config_digest']})
                        worker, _, record, _ = consume_worker(context, 'smoke-' + image['arch'], [target], **inputs)
                        require(worker.get('verified_images') == [target], 'Image was not verified')
                        runs.append(record)
                    images.append(image)
                else:
                    files.append(builds.build_local(context, target))
                publish.save_checkpoint(context, target, files, images, runs, endpoints)
                for image in images:
                    registry.distribute(image, context)
                publish.publish_target(context, target, files, images, runs, endpoints)
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
        if result['status'] != 'success':
            stop.set()
        pool.shutdown(wait=True, cancel_futures=True)
        result['elapsed_seconds'] = round(time.monotonic() - started, 3)
        write_json(path, result)


def finalize(context):
    results = [read_json(path) for path in sorted(OUT.glob('result-*.json'))]
    merged = merge_results(context, results)
    endpoints, manifest = publish.combined_manifest(context, merged)
    state = {'schema': 1, **identity(context), 'status': 'finalizing',
             'actions': {key: enabled(context, key) for key in ('deploy_oss', 'publish_release', 'push_images', 'sync_repos')},
             'steps': {'release': 'pending' if endpoints else 'skipped',
                       'images': 'pending' if enabled(context, 'push_images') else 'skipped',
                       'oss': 'pending' if context['deploy_oss'] else 'skipped'}}
    path = OUT / 'publication.json'
    try:
        if enabled(context, 'push_images') and context['update_latest']:
            state['steps']['latest'] = []
            for image in merged['images']:
                state['steps']['latest'].extend(registry.promote_latest(image, context))
                write_json(path, state)
            state['steps']['images'] = 'success'
        if context['deploy_oss']:
            from oss import deploy
            state['steps']['oss'] = deploy(context, OUT / 'dist-web')
            write_json(path, state)
        for endpoint in endpoints:
            endpoint.finish(manifest, context.get('release_notes'))
            state['steps'][endpoint.provider] = 'public'
            write_json(path, state)
        if endpoints:
            state['steps']['release'] = 'success'
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
    result = {'schema': 1, **identity(context), 'request_id': context['request_id'],
              'workflow_sha': context.get('workflow_sha'), 'targets': targets,
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
            transport.download(context, 'frontend.zip', OUT / 'frontend.zip')
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
            if context.get('inputs'):
                archive = OUT / (targets[0] + '.tar.gz')
                transport.download(context, archive.name, archive)
                run(['docker', 'load', '-i', str(archive)])
                image = 'password-xl-worker:' + targets[0]
                require(run(['docker', 'image', 'inspect', '--format={{.Id}}', image], capture=True) == context['image_config'],
                        'Loaded image config/rootfs differs from the Jenkins build')
                from smoke import check_image
                check_image(image, context, targets[0])
                result['verified_images'] = targets
                result['status'] = 'success'
                return
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


def write_version(context):
    import versioning
    state = read_json(OUT / 'publication.json')
    require(state['status'] == 'success', 'Version writeback requires a successful build/publication')
    check_identity(context, state)
    try:
        report = versioning.writeback(context)
        state['steps']['source_version'] = report
        if enabled(context, 'sync_repos'):
            before = OUT / 'repository-sync.json'
            if before.exists():
                shutil.copyfile(before, OUT / 'repository-sync-before.json')
            source.synchronize_repositories({**context, 'source_sha': report['master_sha']})
    except BaseException:
        state['status'] = 'partial-failure'
        state['steps']['source_version'] = 'failed'
        raise
    finally:
        write_json(OUT / 'publication.json', state)
        endpoints = publish.releases(context)
        errors = []
        for endpoint in endpoints:
            try:
                endpoint.put(OUT / 'publication.json', mutable=True)
            except Exception as error:
                errors.append(type(error).__name__)
        if errors:
            state['status'] = 'partial-failure'
            state['version_report_errors'] = errors
            write_json(OUT / 'publication.json', state)
            for endpoint in endpoints:
                try:
                    endpoint.put(OUT / 'publication.json', mutable=True)
                except Exception:
                    pass
            raise ValueError('Version writeback status could not be saved to both releases')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['prepare', 'checkout', 'sync', 'reserve', 'frontend', 'domain', 'finalize', 'write-version', 'worker', 'cancel', 'rollback-oss'])
    parser.add_argument('--domain', choices=['all', *DOMAINS], default='all')
    parser.add_argument('--deployment')
    args = parser.parse_args()
    cache.prune()
    if args.command == 'worker':
        return worker()
    if args.command == 'cancel':
        workers.cancel_all()
        if (OUT / 'context.json').exists():
            import versioning
            versioning.cleanup(read_json(OUT / 'context.json'))
        return
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
    if args.command == 'sync':
        return source.synchronize_repositories({**context, 'source_sha': context.get('base_source_sha', context['source_sha'])})
    if args.command == 'write-version':
        return write_version(context)
    if args.command == 'reserve':
        return reserve(context)
    if args.command == 'frontend':
        return bundle_frontend(context)
    relevant = DOMAINS[args.domain] if args.command == 'domain' else context['targets']
    if any(t in IMAGE_TARGETS and t in relevant for t in context['targets']):
        auth(enabled(context, 'push_images'))
    if args.command == 'domain':
        return domain(context, args.domain)
    return finalize(context)


if __name__ == '__main__':
    main()
