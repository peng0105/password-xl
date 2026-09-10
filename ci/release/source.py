"""Pin Gitea revisions and independently synchronize release tags and mirror branches."""
import os
import re
import sys
from pathlib import Path

from model import DOMAINS, TARGETS, OUT, ROOT, enabled, env, read_json, require, run, switch, version_code, version_tuple, write_json


def git(args, token, cwd=ROOT):
    helper = OUT / 'private/git-askpass.py'
    helper.parent.mkdir(parents=True, exist_ok=True)
    helper.write_text('#!' + sys.executable + '\nimport os,sys\n'
                      'print(os.environ["GIT_AUTH_USER"] if "username" in sys.argv[1].lower() '
                      'else os.environ["GIT_AUTH_TOKEN"])\n', encoding='utf-8')
    helper.chmod(0o700)
    return run(['git', *args], cwd=cwd, capture=True, extra_env={
        'GIT_ASKPASS': str(helper), 'GIT_TERMINAL_PROMPT': '0',
        'GIT_AUTH_USER': (os.environ.get('GITEE_USERNAME', 'huanyp') if any('https://gitee.com/' in str(a) for a in args)
                          else 'x-access-token'), 'GIT_AUTH_TOKEN': token,
    })


def pin(url, ref, token, cwd=ROOT):
    require(url.startswith('https://') and '@' not in url, 'Use an HTTPS repository URL without credentials')
    require(ref and not ref.startswith('-') and not any(c.isspace() for c in ref), 'Invalid source ref')
    git(['fetch', '--no-tags', url, ref], token, cwd)
    sha = git(['rev-parse', 'FETCH_HEAD^{commit}'], token, cwd)
    require(bool(re.fullmatch('[0-9a-f]{40}', sha)), 'Invalid source SHA')
    return sha


def android_checkout(ref):
    directory = OUT / 'android-source'
    directory.mkdir(parents=True, exist_ok=True)
    if not (directory / '.git').exists():
        run(['git', 'init', str(directory)])
    sha = pin(env('ANDROID_URL'), ref, env('GITEA_TOKEN'), directory)
    git(['checkout', '--detach', sha], env('GITEA_TOKEN'), directory)
    return directory, sha


def prepare(domain):
    targets = list(TARGETS if domain == 'all' else DOMAINS[domain])
    deploy = switch('DEPLOY_OSS', False)
    require(not deploy or domain in ('all', 'web'), 'Only the coordinator/Web can deploy OSS')
    sha = pin(env('GITEA_SOURCE_URL'), 'master', env('GITEA_TOKEN'))
    git(['checkout', '--detach', sha], env('GITEA_TOKEN'))
    version = env('RELEASE_VERSION', read_json(ROOT / 'password-xl-web/package.json')['version']).strip()
    version_tuple(version)
    android_sha = None
    if any(t.startswith('apk-') for t in targets):
        version_code(version)
        _, android_sha = android_checkout('master')
    context = {'schema': 1, 'version': version, 'source_sha': sha, 'android_sha': android_sha,
               'targets': targets, 'deploy_oss': deploy,
               'publish_release': switch('PUBLISH_RELEASE'), 'push_images': switch('PUSH_IMAGES'),
               'sync_repos': switch('SYNC_REPOS'),
               'update_latest': True, 'release_notes': '',
               'jenkins_build': {'job': os.environ.get('JOB_NAME'), 'number': os.environ.get('BUILD_NUMBER'),
                                 'url': os.environ.get('BUILD_URL')}}
    from versioning import prepare as prepare_version
    prepare_version(context)
    write_json(OUT / 'context.json', context)
    return context


def synchronize(context):
    """Push commits only through the version tag. Existing annotated tags are preserved."""
    tag = context['version']
    for url, token in [(env('GITEA_SOURCE_URL'), env('GITEA_TOKEN')),
                       ('https://github.com/' + env('GITHUB_REPO') + '.git', env('GH_TOKEN'))]:
        lines = git(['ls-remote', url, 'refs/tags/' + tag, 'refs/tags/' + tag + '^{}'], token).splitlines()
        refs = dict(line.split('\t') for line in lines)
        # ls-remote maps SHA -> ref; annotated tags must be compared by their peeled commit.
        by_ref = {value: key for key, value in refs.items()}
        existing = by_ref.get('refs/tags/' + tag + '^{}') or by_ref.get('refs/tags/' + tag)
        require(existing is None or existing == context['source_sha'], 'Version tag already points to different source')
        if not existing:
            git(['push', url, context['source_sha'] + ':refs/tags/' + tag], token)
        resolved = pin(url, 'refs/tags/' + tag, token)
        require(resolved == context['source_sha'], 'Mirrored tag SHA differs from the pinned source')


def check_primary_version(context):
    tag = 'refs/tags/' + context['version']
    lines = git(['ls-remote', env('GITEA_SOURCE_URL'), tag, tag + '^{}'], env('GITEA_TOKEN')).splitlines()
    refs = {line.split('\t')[1]: line.split('\t')[0] for line in lines}
    existing = refs.get(tag + '^{}') or refs.get(tag)
    require(existing is None or existing == context['source_sha'], 'Published version already belongs to different source; bump package.json')


def synchronize_repositories(context):
    """Gitea is authoritative. Merge its pinned commit into each mirror without force pushes."""
    if not enabled(context, 'sync_repos'):
        return
    import subprocess
    result = {'source_sha': context['source_sha'], 'status': 'running', 'mirrors': []}
    path = OUT / 'repository-sync.json'
    try:
        for name, url, token in [('github', 'https://github.com/' + env('GITHUB_REPO') + '.git', env('GH_TOKEN')),
                                 ('gitee', env('GITEE_URL'), env('GITEE_TOKEN'))]:
            old = pin(url, 'master', token)
            directory = OUT / 'mirror-worktrees' / name
            require(directory.resolve().is_relative_to(OUT.resolve()) and not directory.exists(), 'Mirror workspace already exists')
            directory.parent.mkdir(parents=True, exist_ok=True)
            git(['worktree', 'add', '--detach', str(directory), old], token)
            try:
                # A mirror may retain its README/history, but conflicts require an explicit source fix.
                git(['-c', 'user.name=Password XL Jenkins', '-c', 'user.email=ci@password-xl.invalid',
                     'merge', '--no-edit', context['source_sha']], token, directory)
                merged = git(['rev-parse', 'HEAD'], token, directory)
                if merged != old:
                    git(['push', url, merged + ':refs/heads/master'], token, directory)
                actual = pin(url, 'master', token)
                require(actual == merged, 'Mirror moved during synchronization: ' + name)
                run(['git', 'merge-base', '--is-ancestor', context['source_sha'], actual])
                result['mirrors'].append({'name': name, 'before': old, 'after': actual, 'status': 'success'})
            finally:
                # Only the disposable worktree just created here is cleaned; never the main checkout.
                subprocess.run(['git', 'merge', '--abort'], cwd=directory, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                git(['worktree', 'remove', str(directory)], token)
        result['status'] = 'success'
    except BaseException:
        result['status'] = 'failed'
        raise
    finally:
        write_json(path, result)
