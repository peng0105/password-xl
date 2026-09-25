"""Limited Kubernetes API deployment with optimistic concurrency and checked rollback."""
import copy
import base64
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

import yaml

from model import OUT, ROOT, identity, require, write_json

ANNOTATION = 'password-xl.cn/release'
FIELD_MANAGER = 'password-xl-release'
WEB_RESOURCES = (
    ('Deployment', 'apps/v1', 'deployments', 'deployment.yaml', 'password-xl-web'),
    ('Service', 'v1', 'services', 'service.yaml', 'password-xl-web'),
    ('Ingress', 'networking.k8s.io/v1', 'ingresses', 'ingress.yaml', 'password-xl-web-ingress'),
)


def kube_credentials(namespace):
    config_path = os.environ.get('KUBECONFIG')
    require(config_path, 'KUBECONFIG credential is missing')
    config = yaml.safe_load(Path(config_path).read_text())

    def named(items, name):
        matches = [item for item in items if item.get('name') == name]
        require(len(matches) == 1, 'Kubeconfig reference is missing or ambiguous')
        return matches[0]

    context = named(config['contexts'], config['current-context'])['context']
    require(context.get('namespace') == namespace, 'Kubeconfig targets the wrong namespace')
    cluster = named(config['clusters'], context['cluster'])['cluster']
    user = named(config['users'], context['user'])['user']
    base = cluster['server'].rstrip('/')
    require(base.startswith('https://'), 'Kubernetes API requires TLS')
    require(not cluster.get('insecure-skip-tls-verify'), 'Kubernetes API certificate verification is required')
    require(cluster.get('certificate-authority-data'), 'Kubeconfig CA is missing')
    require(user.get('token'), 'Kubeconfig service account token is missing')
    ca = base64.b64decode(cluster['certificate-authority-data'], validate=True).decode('ascii')
    return base, user['token'], ssl.create_default_context(cadata=ca)


class Kubernetes:
    def __init__(self, namespace='password-xl', name='password-xl-web'):
        self.namespace, self.name = namespace, name
        self.path = f'/apis/apps/v1/namespaces/{namespace}/deployments/{name}'
        self.base, self.token, tls = kube_credentials(namespace)
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=tls))

    def request(self, method, path, data=None, content_type='application/json-patch+json', missing_ok=False):
        headers = {'Authorization': 'Bearer ' + self.token}
        if data is not None:
            headers['Content-Type'] = content_type
        request = urllib.request.Request(self.base + path, headers=headers, method=method,
                                         data=json.dumps(data).encode() if data is not None else None)
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if missing_ok and error.code == 404:
                return None
            raise RuntimeError(f'Kubernetes {method} failed: HTTP {error.code}') from None

    def get(self, missing_ok=False):
        return self.request('GET', self.path, missing_ok=missing_ok)

    def pods(self):
        selector = urllib.parse.quote('app=' + self.name, safe='')
        return self.request('GET', f'/api/v1/namespaces/{self.namespace}/pods?labelSelector={selector}')['items']

    def patch(self, previous, template):
        # Fail on any intervening edit rather than overwriting an operator's changes.
        return self.request('PATCH', self.path, [
            {'op': 'test', 'path': '/metadata/resourceVersion', 'value': previous['metadata']['resourceVersion']},
            {'op': 'replace', 'path': '/spec/template', 'value': template}])

    def apply(self, document):
        kind = document['kind']
        group = next((group for item, group, resource, _, _ in WEB_RESOURCES if item == kind), None)
        resource = next((resource for item, _, resource, _, _ in WEB_RESOURCES if item == kind), None)
        require(resource is not None, 'Unsupported Kubernetes manifest kind')
        api = '/api/v1' if group == 'v1' else '/apis/' + group
        name = urllib.parse.quote(document['metadata']['name'], safe='')
        path = f'{api}/namespaces/{self.namespace}/{resource}/{name}?fieldManager={FIELD_MANAGER}&force=true'
        return self.request('PATCH', path, document, content_type='application/apply-patch+yaml')

    def access(self, group, resource, verb, name=None):
        attributes = {'namespace': self.namespace, 'verb': verb, 'group': group, 'resource': resource}
        if name:
            attributes['name'] = name
        value = {'apiVersion': 'authorization.k8s.io/v1', 'kind': 'SelfSubjectAccessReview',
                 'spec': {'resourceAttributes': attributes}}
        request = urllib.request.Request(self.base + '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
            data=json.dumps(value).encode(), headers={'Authorization': 'Bearer ' + self.token,
                                                      'Content-Type': 'application/json'}, method='POST')
        with self.opener.open(request, timeout=30) as response:
            require(json.loads(response.read())['status']['allowed'],
                    f'Kubernetes {verb} permission is missing for {resource}')

    def fetch(self, path):
        url = f'http://{self.name}.{self.namespace}.svc.cluster.local/' + urllib.parse.quote(path, safe='/')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        deadline = time.monotonic() + 30
        while True:
            try:
                with opener.open(url, timeout=10) as response:
                    require(response.status == 200, 'Web Service returned an error')
                    return response.read()
            except (urllib.error.URLError, OSError) as error:
                if isinstance(error, urllib.error.HTTPError) and error.code not in (502, 503, 504):
                    raise
                if time.monotonic() >= deadline:
                    raise
                time.sleep(2)  # EndpointSlice/kube-proxy may briefly lag Deployment readiness.


def container_index(deployment, name):
    matches = [i for i, c in enumerate(deployment['spec']['template']['spec']['containers']) if c['name'] == name]
    require(len(matches) == 1, 'Expected exactly one matching Web container')
    return matches[0]


def web_manifests(namespace='password-xl', name='password-xl-web'):
    manifests = {}
    for kind, api_version, _, filename, expected_name in WEB_RESOURCES:
        # The deployer reads the checked-out source, never a cluster-side copy of the manifests.
        document = yaml.safe_load((ROOT / 'k8s/web' / filename).read_text(encoding='utf-8'))
        require(isinstance(document, dict) and document.get('apiVersion') == api_version and
                document.get('kind') == kind and document.get('metadata', {}).get('name') == expected_name and
                document['metadata'].get('namespace') == namespace,
                f'Invalid Kubernetes web manifest: {filename}')
        manifests[kind] = document
    deployment, service, ingress = (manifests[kind] for kind in ('Deployment', 'Service', 'Ingress'))
    container_index(deployment, name)
    labels = deployment['spec']['template']['metadata']['labels']
    require(all(labels.get(key) == value for key, value in service['spec']['selector'].items()),
            'Web Service selector does not match the Deployment')
    require(all(path['backend']['service']['name'] == name for rule in ingress['spec']['rules']
                for path in rule['http']['paths']), 'Web Ingress targets another Service')
    return manifests


def preflight(client=None):
    client = client or Kubernetes()
    web_manifests(client.namespace, client.name)
    for _, group, resource, _, name in WEB_RESOURCES:
        api_group = '' if group == 'v1' else group.rsplit('/', 1)[0]
        for verb in ('get', 'create', 'patch'):
            client.access(api_group, resource, verb, None if verb == 'create' else name)
    client.access('', 'pods', 'list')
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
    manifests = web_manifests(client.namespace, client.name)
    deployment = copy.deepcopy(manifests['Deployment'])
    index = container_index(deployment, client.name)
    deployment['spec']['template']['spec']['containers'][index]['image'] = image
    marker = json.dumps({k: context[k] for k in ('version', 'source_sha')}, sort_keys=True)
    deployment['spec']['template'].setdefault('metadata', {}).setdefault('annotations', {})[ANNOTATION] = marker
    before = client.get(missing_ok=True)
    if before is not None:
        container_index(before, client.name)
    report = {**identity(context), 'namespace': client.namespace, 'deployment': client.name,
              'created': before is None,
              'previous_image': before['spec']['template']['spec']['containers'][container_index(before, client.name)]['image']
              if before else None,
              'previous_pods': [{'name': p['metadata']['name'], 'images': p.get('status', {}).get('containerStatuses', [])}
                                for p in client.pods()] if before else [], 'image': image, 'status': 'deploying'}
    write_json(OUT / 'kubernetes-before.json', before)
    path = OUT / 'kubernetes-deployment.json'
    write_json(path, report)
    applied = None
    try:
        client.apply(manifests['Service'])
        client.apply(manifests['Ingress'])
        applied = client.apply(deployment)
        wait_ready(client, applied, timeout)
        verify(client, context, image, directory)
        report['status'] = 'success'
        report['changed'] = before is None or applied['metadata']['resourceVersion'] != before['metadata']['resourceVersion']
        report['public_access'] = public_diagnostic(context)
        return report
    except BaseException as error:
        report['status'], report['error_type'] = 'failed', type(error).__name__
        try:
            if before is None:
                # No previous image exists to restore on the first installation.
                report['rollback'] = 'unavailable-first-install'
            else:
                current = client.get()
                if current['spec']['template'] != before['spec']['template']:
                    require(applied is not None and current['spec']['template'] == applied['spec']['template'],
                            'Concurrent edit or lost apply response prevents rollback')
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
