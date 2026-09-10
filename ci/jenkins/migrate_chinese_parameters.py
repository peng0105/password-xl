"""Repair the five release jobs and migrate their existing parameters, without a build.

Use JENKINS_URL and JENKINS_AUTHORIZATION (the complete HTTP Authorization header).
Run with --folder <folder>; inspect the report, then add --apply to install it.
Only descriptions and parameter names change. Versions/defaults/SCM/history stay intact.
"""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from xml.etree import ElementTree as ET

NAMES = {'VERSION': '构建版本', 'DEPLOY_OSS': '发布OSS', 'PUBLISH_RELEASE': '发布Release',
         'PUSH_IMAGES': '推送镜像', 'SYNC_REPOS': '同步仓库'}
JOBS = ['password-xl-release'] + ['password-xl-' + d + '-release'
                                 for d in ('web', 'service', 'desktop', 'android')]


def repair_text(value):
    """Reverse proven UTF-8-as-Latin-1 corruption only when it recovers Chinese text."""
    candidate = value or ''
    for _ in range(8):
        try:
            decoded = candidate.encode('latin1').decode('utf-8')
        except UnicodeError:
            break
        if decoded == candidate:
            break
        candidate = decoded
    return candidate if any('\u4e00' <= c <= '\u9fff' for c in candidate) else value


def migrate(config):
    for description in config.iter('description'):
        description.text = repair_text(description.text)
    definitions = config.find('.//parameterDefinitions')
    if definitions is None:
        raise ValueError('Expected existing release parameters')
    names = [p.findtext('name') for p in definitions]
    if any(name not in {*NAMES, *NAMES.values()} for name in names):
        raise ValueError('Unexpected parameters; inspect this job before migration')
    translated = [NAMES.get(name, name) for name in names]
    if len(set(translated)) != len(translated) or '构建版本' not in translated:
        raise ValueError('Duplicate or missing version parameter')
    for parameter, name in zip(definitions, translated):
        parameter.find('name').text = name
    return config


def xml_payload(config):
    # ASCII character references also survive servlet readers whose fallback is Latin-1.
    return ET.tostring(config, encoding='us-ascii', xml_declaration=True)


class Jenkins:
    def __init__(self, url, authorization):
        self.url = url.rstrip('/')
        self.authorization = authorization
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, data=None, content_type=None):
        headers = {'Authorization': self.authorization}
        if data is not None:
            crumb = json.loads(self.request('/crumbIssuer/api/json'))
            headers[crumb['crumbRequestField']] = crumb['crumb']
        if content_type:
            headers['Content-Type'] = content_type
        with self.opener.open(urllib.request.Request(self.url + path, data=data, headers=headers), timeout=30) as r:
            return r.read()

    def save_config(self, path, config):
        self.request(path + '/config.xml', xml_payload(config), 'application/xml; charset=UTF-8')
        saved = ET.fromstring(self.request(path + '/config.xml'))
        # Compare all text, not just parameter names: the old scripts missed corrupt descriptions.
        def fields(xml):
            return [(node.tag, (node.text or '').strip()) for node in xml.iter()]
        if fields(saved) != fields(config):
            raise RuntimeError('Jenkins config readback differs; inspect the saved backup')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--output', type=Path, default=Path('.release/jenkins-encoding/migration'))
    args = parser.parse_args()
    api = Jenkins(os.environ['JENKINS_URL'], os.environ['JENKINS_AUTHORIZATION'])
    folder = ''.join('/job/' + urllib.parse.quote(p, safe='') for p in args.folder.split('/') if p)
    report = []
    pending = []
    # Preflight every job before updating any of them.
    for name in JOBS:
        path = folder + '/job/' + name
        state = json.loads(api.request(path + '/api/json?tree=inQueue,lastBuild[building]'))
        if state['inQueue'] or (state.get('lastBuild') or {}).get('building'):
            raise RuntimeError(name + ' is active; retry when idle')
        original = api.request(path + '/config.xml')
        config = migrate(ET.fromstring(original))
        args.output.mkdir(parents=True, exist_ok=True)
        backup = args.output / (name + '-before.xml')
        if not backup.exists():
            backup.write_bytes(original)
        report.append({'job': name, 'description': config.findtext('description'), 'parameters': [
            {'name': p.findtext('name'), 'description': p.findtext('description'),
             'default': p.findtext('defaultValue')} for p in config.findall('.//parameterDefinitions/*')]})
        pending.append((path, config))
    if args.apply:
        for path, config in pending:
            api.save_config(path, config)
    (args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'applied': args.apply, 'jobs': report}, ensure_ascii=True))


if __name__ == '__main__':
    main()
