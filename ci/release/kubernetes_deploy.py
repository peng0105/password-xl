"""Limited Kubernetes API deployment with optimistic concurrency and checked rollback."""
import copy
import hashlib
import json
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from model import OUT, identity, require, write_json

ANNOTATION = 'password-xl.cn/release'


class Kubernetes:
    def __init__(self, namespace='password-xl', name='password-xl-web'):
        self.namespace, self.name = namespace, name
        self.path = f'/apis/apps/v1/namespaces/{namespace}/deployments/{name}'
        self.base = os.environ.get('KUBE_API_URL', 'https://kubernetes.default.svc')
        require(self.base.startswith('https://'), 'Kubernetes API requires TLS')
        self.token = Path('/var/run/secrets/password-xl/token')
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile='/var/run/secrets/password-xl/ca.crt')))

    def request(self, method, path, data=None):
        headers = {'Authorization': 'Bearer ' + self.token.read_text().strip()}
        if data is not None:
            headers['Content-Type'] = 'application/json-patch+json'
        request = urllib.request.Request(self.base + path, headers=headers, method=method,
                                         data=json.dumps(data).encode() if data is not None else None)
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Kubernetes {method} failed: HTTP {error.code}') from None

    def get(self):
        return self.request('GET', self.path)

    def pods(self):
        selector = urllib.parse.quote('app=' + self.name, safe='')
        return self.request('GET', f'/api/v1/namespaces/{self.namespace}/pods?labelSelector={selector}')['items']

    def patch(self, previous, template):
        # Fail on any intervening edit rather than overwriting an operator's changes.
        return self.request('PATCH', self.path, [
            {'op': 'test', 'path': '/metadata/resourceVersion', 'value': previous['metadata']['resourceVersion']},
            {'op': 'replace', 'path': '/spec/template', 'value': template}])

    def access(self):
        value = {'apiVersion': 'authorization.k8s.io/v1', 'kind': 'SelfSubjectAccessReview',
                 'spec': {'resourceAttributes': {'namespace': self.namespace, 'verb': 'patch',
                         'group': 'apps', 'resource': 'deployments', 'name': self.name}}}
        request = urllib.request.Request(self.base + '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
            data=json.dumps(value).encode(), headers={'Authorization': 'Bearer ' + self.token.read_text().strip(),
                                                      'Content-Type': 'application/json'}, method='POST')
        with self.opener.open(request, timeout=30) as response:
            require(json.loads(response.read())['status']['allowed'], 'Kubernetes deployment permission is missing')

    def fetch(self, path):
        url = f'http://{self.name}.{self.namespace}.svc.cluster.local/' + urllib.parse.quote(path, safe='/')
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url, timeout=20) as response:
            require(response.status == 200, 'Web Service returned an error')
            return response.read()


def container_index(deployment, name):
    matches = [i for i, c in enumerate(deployment['spec']['template']['spec']['containers']) if c['name'] == name]
    require(len(matches) == 1, 'Expected exactly one matching Web container')
    return matches[0]


def preflight(client=None):
    client = client or Kubernetes()
    value = client.get()
    container_index(value, client.name)
    require(value['spec'].get('replicas', 1) > 0, 'Web deployment has no replicas')
    require(not value['spec'].get('paused'), 'Web deployment is paused')
    client.pods()
    client.access()
    return client


def wait_ready(client, expected, timeout=300):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        current = client.get()
        require(current['spec']['template'] == expected['spec']['template'], 'Deployment changed concurrently')
        status, desired = current.get('status', {}), current['spec'].get('replicas', 1)
        if (status.get('observedGeneration', 0) >= expected['metadata']['generation'] and
                status.get('updatedReplicas', 0) == desired and status.get('readyReplicas', 0) == desired and
                status.get('availableReplicas', 0) == desired and status.get('replicas', 0) == desired):
            return current
        time.sleep(3)
    raise TimeoutError('Kubernetes rollout timed out')


def verify(client, context, image, directory):
    pods = [p for p in client.pods() if not p['metadata'].get('deletionTimestamp')]
    require(pods, 'No Web pods exist')
    for pod in pods:
        states = [c for c in pod.get('status', {}).get('containerStatuses', []) if c['name'] == client.name]
        require(len(states) == 1 and states[0].get('ready'), 'Web pod is not ready')
        require(states[0]['imageID'].split('@')[-1] == image.split('@')[-1], 'Running image digest mismatch')
    client.fetch('healthz')
    expected = {key: context[key] for key in ('version', 'source_sha')}
    require(json.loads(client.fetch('release.json')) == expected, 'Deployed frontend version/source mismatch')
    directory = Path(directory)
    entry = (directory / 'index.html').read_bytes()
    require(client.fetch('index.html') == entry, 'Deployed HTML differs from build')
    assets = re.findall(r'(?:src|href)=["\']/?(assets/[^"\']+)["\']', entry.decode())
    require(assets, 'Frontend entry has no assets')
    for name in sorted(set(assets)):
        require('..' not in name.split('/'), 'Unsafe frontend resource path')
        require(hashlib.sha256(client.fetch(name)).digest() == hashlib.sha256((directory / name).read_bytes()).digest(),
                'Deployed resource differs: ' + name)


def deploy(context, image, directory, client=None, timeout=300):
    client = preflight(client)
    require(re.fullmatch(r'[^\s@]+@sha256:[0-9a-f]{64}', image), 'Deploy a pinned image digest')
    before = client.get()
    index = container_index(before, client.name)
    template = copy.deepcopy(before['spec']['template'])
    template['spec']['containers'][index]['image'] = image
    marker = json.dumps({k: context[k] for k in ('version', 'source_sha')}, sort_keys=True)
    template.setdefault('metadata', {}).setdefault('annotations', {})[ANNOTATION] = marker
    report = {**identity(context), 'namespace': client.namespace, 'deployment': client.name,
              'previous_image': before['spec']['template']['spec']['containers'][index]['image'],
              'previous_pods': [{'name': p['metadata']['name'], 'images': p.get('status', {}).get('containerStatuses', [])}
                                for p in client.pods()], 'image': image, 'status': 'deploying'}
    write_json(OUT / 'kubernetes-before.json', before)
    path = OUT / 'kubernetes-deployment.json'
    write_json(path, report)
    applied = None
    try:
        applied = before if template == before['spec']['template'] else client.patch(before, template)
        wait_ready(client, applied, timeout)
        verify(client, context, image, directory)
        report['status'] = 'success'
        report['changed'] = applied['metadata']['resourceVersion'] != before['metadata']['resourceVersion']
        report['public_access'] = public_diagnostic(context)
        return report
    except BaseException as error:
        report['status'], report['error_type'] = 'failed', type(error).__name__
        try:
            current = client.get()
            # Also covers a lost PATCH response: only undo our exact template.
            if current['spec']['template'] != before['spec']['template']:
                require(current['spec']['template'] == template, 'Concurrent edit prevents rollback')
                restored = client.patch(current, before['spec']['template'])
                wait_ready(client, restored, timeout)
                client.fetch('healthz')
                report['rollback'] = 'success'
            else:
                report['rollback'] = 'not-needed'
        except BaseException as rollback_error:
            report['rollback'] = 'failed'
            report['rollback_error_type'] = type(rollback_error).__name__
        raise
    finally:
        write_json(path, report)


def public_diagnostic(context):
    try:
        url = os.environ.get('KUBE_PUBLIC_URL', 'https://password-xl.cn').rstrip('/') + '/release.json'
        require(url.startswith('https://'), 'Public check requires HTTPS')
        with urllib.request.urlopen(url, timeout=15) as response:
            observed = json.loads(response.read())
        return {'status': 'reachable', 'observed': observed,
                'matches_deployment': all(observed.get(k) == context[k] for k in ('version', 'source_sha'))}
    except Exception as error:
        return {'status': 'unavailable', 'error_type': type(error).__name__}
