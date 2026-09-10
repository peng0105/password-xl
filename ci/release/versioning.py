"""Prepare reproducible version commits; publish them to master only after success."""
import json
import os
import subprocess
import uuid
from pathlib import Path

import source
from model import OUT, ROOT, env, read_json, require, run, version_tuple, write_json

PACKAGE = 'password-xl-web/package.json'
AUTHOR = ['-c', 'user.name=Password XL Jenkins', '-c', 'user.email=ci@password-xl.invalid']


def metadata(sha):
    return json.loads(source.git(['show', sha + ':' + PACKAGE], env('GITEA_TOKEN')))


def prepare(context):
    base = context['source_sha']
    package = metadata(base)
    require(version_tuple(context['version']) >= version_tuple(package['version']),
            'VERSION is older than master; select the current or a newer version')
    context['base_source_sha'] = base
    if context['version'] == package['version']:
        return
    require(not source.git(['status', '--porcelain', '--untracked-files=no'], env('GITEA_TOKEN')),
            'Version preparation requires a clean checkout')
    package['version'] = context['version']
    write_json(ROOT / PACKAGE, package)
    source.git(['add', '--', PACKAGE], env('GITEA_TOKEN'))
    tree = source.git(['write-tree'], env('GITEA_TOKEN'))
    timestamp = str(int(source.git(['show', '-s', '--format=%ct', base], env('GITEA_TOKEN'))) + 1) + ' +0000'
    # Stable author/date/message makes a failed build retry bind to the same SHA.
    sha = run(['git', *AUTHOR, 'commit-tree', tree, '-p', base, '-m', '构建版本 ' + context['version']],
              capture=True, extra_env={'GIT_AUTHOR_DATE': timestamp, 'GIT_COMMITTER_DATE': timestamp})
    source.git(['checkout', '--detach', sha], env('GITEA_TOKEN'))
    context['source_sha'] = sha
    context['version_ref'] = 'refs/heads/codex/jenkins-version/' + uuid.uuid4().hex
    write_json(OUT / 'context.json', context)  # Also permits cleanup after an uncertain push.
    source.git(['push', env('GITEA_SOURCE_URL'), sha + ':' + context['version_ref']], env('GITEA_TOKEN'))
    require(source.pin(env('GITEA_SOURCE_URL'), context['version_ref'], env('GITEA_TOKEN')) == sha,
            'Version source was not made available to workers')


def ancestor(older, newer):
    result = subprocess.run(['git', 'merge-base', '--is-ancestor', older, newer], cwd=ROOT)
    require(result.returncode in (0, 1), 'Cannot verify version ancestry')
    return result.returncode == 0


def writeback(context):
    """Normal FF/merge, keeping concurrent commits and never lowering the source version."""
    url, token = env('GITEA_SOURCE_URL'), env('GITEA_TOKEN')
    built = metadata(context['source_sha'])
    require(built['version'] == context['version'], 'Build commit version differs from VERSION')
    base = context.get('base_source_sha', context['source_sha'])
    if base != context['source_sha']:
        before = metadata(base)
        before['version'] = context['version']
        require(before == built and source.git(['diff', '--name-only', base, context['source_sha']], token) == PACKAGE,
                'Version commit contains unrelated changes')
    report = {'version': context['version'], 'source_sha': context['source_sha'], 'status': 'failed'}
    try:
        for attempt in range(3):
            current = source.pin(url, 'master', token)
            current_version = metadata(current)['version']
            require(ancestor(base, current), 'Gitea master history changed during the build')
            if ancestor(context['source_sha'], current):
                require(version_tuple(current_version) >= version_tuple(context['version']),
                        'Source version was manually lowered during the build')
                candidate = current
            elif current == base:
                candidate = context['source_sha']
            else:
                directory = OUT / 'version-writeback-worktree'
                require(not directory.exists() and directory.resolve().is_relative_to(OUT.resolve()), 'Unsafe version worktree')
                source.git(['worktree', 'add', '--detach', str(directory), current], token)
                try:
                    package = read_json(directory / PACKAGE)
                    package['version'] = max((package['version'], context['version']), key=version_tuple)
                    write_json(directory / PACKAGE, package)
                    source.git(['add', '--', PACKAGE], token, directory)
                    tree = source.git(['write-tree'], token, directory)
                    # Only the version is copied onto current master; both histories remain reachable.
                    candidate = source.git([*AUTHOR, 'commit-tree', tree, '-p', current, '-p', context['source_sha'],
                                            '-m', '回写构建版本 ' + context['version']], token, directory)
                    source.git(['checkout', '--detach', candidate], token, directory)
                finally:
                    source.git(['worktree', 'remove', '--force', str(directory)], token)
            if candidate != current:
                try:
                    source.git(['push', url, candidate + ':refs/heads/master'], token)
                except subprocess.CalledProcessError:
                    if source.pin(url, 'master', token) != current and attempt < 2:
                        continue
                    raise
            actual = source.pin(url, 'master', token)
            require(ancestor(candidate, actual), 'Version writeback was not preserved in master')
            report.update(status='success', master_sha=actual, source_version=metadata(actual)['version'])
            return report
        raise ValueError('Master kept changing during version writeback')
    finally:
        write_json(OUT / 'version-writeback.json', report)


def cleanup(context):
    reference = context.get('version_ref')
    owner = context.get('jenkins_build', {})
    if not reference or owner.get('job') != os.environ.get('JOB_NAME') or str(owner.get('number')) != os.environ.get('BUILD_NUMBER'):
        return  # Children must never delete their parent's source ref.
    import re
    require(re.fullmatch(r'refs/heads/codex/jenkins-version/[0-9a-f]{32}', reference), 'Invalid version ref cleanup')
    url, token = env('GITEA_SOURCE_URL'), env('GITEA_TOKEN')
    lines = source.git(['ls-remote', url, reference], token).splitlines()
    if lines:
        require(len(lines) == 1 and lines[0].split('\t') == [context['source_sha'], reference], 'Version ref identity changed')
        source.git(['push', url, ':' + reference], token)
    write_json(OUT / 'version-ref-cleanup.json', {'ref': reference, 'status': 'removed'})
