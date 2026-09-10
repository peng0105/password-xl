"""Pin Gitea revisions and synchronize immutable tags, without modifying branches."""
import os
import re
import sys
from pathlib import Path

from model import DOMAINS, TARGETS, OUT, ROOT, env, read_json, require, run, version_tuple, write_json


def git(args, token, cwd=ROOT):
    helper = OUT / 'private/git-askpass.py'
    helper.parent.mkdir(parents=True, exist_ok=True)
    helper.write_text('#!' + sys.executable + '\nimport os,sys\n'
                      'print(os.environ["GIT_AUTH_USER"] if "username" in sys.argv[1].lower() '
                      'else os.environ["GIT_AUTH_TOKEN"])\n', encoding='utf-8')
    helper.chmod(0o700)
    return run(['git', *args], cwd=cwd, capture=True, extra_env={
        'GIT_ASKPASS': str(helper), 'GIT_TERMINAL_PROMPT': '0',
        'GIT_AUTH_USER': 'x-access-token', 'GIT_AUTH_TOKEN': token,
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
    deploy = env('DEPLOY_OSS', 'false').lower() == 'true'
    require(not deploy or domain in ('all', 'web'), 'Only the coordinator/Web can deploy OSS')
    sha = pin(env('GITEA_SOURCE_URL'), 'master', env('GITEA_TOKEN'))
    git(['checkout', '--detach', sha], env('GITEA_TOKEN'))
    version = read_json(ROOT / 'password-xl-web/package.json')['version']
    version_tuple(version)
    android_sha = None
    if any(t.startswith('apk-') for t in targets):
        _, android_sha = android_checkout('master')
    context = {'schema': 1, 'version': version, 'source_sha': sha, 'android_sha': android_sha,
               'targets': targets, 'deploy_oss': deploy,
               'update_latest': True, 'release_notes': '',
               'jenkins_build': {'job': os.environ.get('JOB_NAME'), 'number': os.environ.get('BUILD_NUMBER'),
                                 'url': os.environ.get('BUILD_URL')}}
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
