import copy
import hashlib
import itertools
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import kubernetes_deploy as kube
import model
import oss
import publish
import registry
import release

C = {'version': '1.5.2', 'source_sha': 'a' * 40, 'android_sha': None}
IMAGE = 'private.test/password-xl-web-x86@sha256:' + 'b' * 64


class Cluster:
    name, namespace = 'password-xl-web', 'test'

    def __init__(self):
        self.value = {'metadata': {'resourceVersion': '1', 'generation': 1},
                      'spec': {'replicas': 1, 'template': {'metadata': {'labels': {'app': self.name}},
                               'spec': {'containers': [{'name': self.name, 'image': 'old:49'}]}}},
                      'status': {'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1,
                                 'readyReplicas': 1, 'availableReplicas': 1}}
        self.writes = []
        self.files = {'index.html': b'<script src="/assets/app.js"></script>', 'assets/app.js': b'app',
                      'release.json': json.dumps({k: C[k] for k in ('version', 'source_sha')}).encode(), 'healthz': b'ok'}

    def access(self): pass
    def get(self): return copy.deepcopy(self.value)
    def pods(self):
        image = self.value['spec']['template']['spec']['containers'][0]['image']
        return [{'metadata': {'name': 'web-pod'}, 'status': {'containerStatuses': [
            {'name': self.name, 'ready': True, 'imageID': image}]}}]
    def fetch(self, path): return self.files[path]
    def patch(self, previous, template):
        if previous['metadata']['resourceVersion'] != self.value['metadata']['resourceVersion']:
            raise RuntimeError('conflict')
        self.writes.append(copy.deepcopy(template))
        self.value['spec']['template'] = copy.deepcopy(template)
        self.value['metadata']['generation'] += 1
        self.value['metadata']['resourceVersion'] = str(self.value['metadata']['generation'])
        self.value['status']['observedGeneration'] = self.value['metadata']['generation']
        return self.get()


class Deployment(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.cluster = Cluster()
        for name, content in self.cluster.files.items():
            p = self.path / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(content)
        self.out = patch.object(kube, 'OUT', self.path); self.out.start(); self.addCleanup(self.out.stop)
        diagnostic = patch.object(kube, 'public_diagnostic', return_value={'status':'test'})
        diagnostic.start(); self.addCleanup(diagnostic.stop)

    def test_success_and_repeat_do_not_restart_or_change_other_settings(self):
        before = self.cluster.get()
        result = kube.deploy(C, IMAGE, self.path, self.cluster)
        self.assertEqual(result['status'], 'success')
        self.assertEqual(self.cluster.value['spec']['replicas'], before['spec']['replicas'])
        self.assertEqual(kube.deploy(C, IMAGE, self.path, self.cluster)['changed'], False)
        self.assertEqual(len(self.cluster.writes), 1)

    def test_content_failure_rolls_back_and_remains_failed(self):
        self.cluster.files['assets/app.js'] = b'wrong'
        with self.assertRaisesRegex(ValueError, 'resource differs'):
            kube.deploy(C, IMAGE, self.path, self.cluster)
        self.assertEqual(self.cluster.value['spec']['template']['spec']['containers'][0]['image'], 'old:49')
        report = model.read_json(self.path / 'kubernetes-deployment.json')
        self.assertEqual((report['status'], report['rollback']), ('failed', 'success'))

    def test_timeout_attempts_verified_rollback(self):
        with patch.object(kube, 'wait_ready', side_effect=[TimeoutError('rollout'), self.cluster.get()]):
            with self.assertRaises(TimeoutError): kube.deploy(C, IMAGE, self.path, self.cluster)
        self.assertEqual(model.read_json(self.path / 'kubernetes-deployment.json')['rollback'], 'success')

    def test_concurrent_edit_is_not_overwritten_by_rollback(self):
        def fail(*args):
            self.cluster.value['spec']['template']['spec']['containers'][0]['image'] = 'operator:new'
            raise ValueError('concurrent change')
        with patch.object(kube, 'verify', side_effect=fail):
            with self.assertRaises(ValueError): kube.deploy(C, IMAGE, self.path, self.cluster)
        self.assertEqual(len(self.cluster.writes), 1)
        self.assertEqual(self.cluster.value['spec']['template']['spec']['containers'][0]['image'], 'operator:new')
        self.assertEqual(model.read_json(self.path / 'kubernetes-deployment.json')['rollback'], 'failed')

    def test_lost_patch_response_is_rolled_back_only_when_template_matches(self):
        original = self.cluster.patch
        def patch_then_disconnect(previous, template):
            result = original(previous, template)
            if len(self.cluster.writes) == 1: raise ConnectionError('lost response')
            return result
        self.cluster.patch = patch_then_disconnect
        with self.assertRaises(ConnectionError): kube.deploy(C, IMAGE, self.path, self.cluster)
        self.assertEqual(model.read_json(self.path / 'kubernetes-deployment.json')['rollback'], 'success')


class Controls(unittest.TestCase):
    def test_old_context_never_enables_cluster(self):
        self.assertFalse(model.enabled({}, 'deploy_kubernetes'))

    def test_all_32_action_combinations_preserve_independent_effects(self):
        for kubernetes, site, pub, push, sync in itertools.product((False, True), repeat=5):
            context = {**C, 'targets': ['web-x86'], 'deploy_kubernetes': kubernetes, 'deploy_oss': site,
                       'publish_release': pub, 'push_images': push, 'sync_repos': sync, 'update_latest': True}
            result = {**C, 'domain': 'web', 'status': 'success', 'targets': ['web-x86'], 'files': [],
                      'images': [], 'worker_runs': [], 'deployment_image': IMAGE}
            endpoint = Mock(provider='github')
            with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'OUT', Path(tmp)), \
                    patch.object(publish, 'combined_manifest', return_value=([endpoint] if pub else [], result)), \
                    patch.object(kube, 'deploy', return_value={'status':'success'}) as deploy, \
                    patch.object(oss, 'deploy', return_value={'status':'success'}) as oss_deploy:
                model.write_json(Path(tmp)/'result-web.json', result)
                release.finalize(context)
                self.assertEqual(deploy.call_count, int(kubernetes))
                self.assertEqual(oss_deploy.call_count, int(site))
                self.assertEqual(endpoint.finish.call_count, int(pub))

    def test_cluster_failure_prevents_other_promotions(self):
        context = {**C, 'targets':['web-x86'], 'deploy_kubernetes':True, 'deploy_oss':True, 'update_latest':True}
        result = {**C, 'domain':'web', 'status':'success', 'targets':['web-x86'], 'files':[], 'images':[],
                  'worker_runs':[], 'deployment_image':IMAGE}
        endpoint = Mock(provider='github')
        with tempfile.TemporaryDirectory() as tmp, patch.object(release,'OUT',Path(tmp)), \
                patch.object(publish,'combined_manifest',return_value=([endpoint],result)), \
                patch.object(kube,'deploy',side_effect=TimeoutError), patch.object(oss,'deploy') as site:
            model.write_json(Path(tmp)/'result-web.json',result)
            with self.assertRaises(TimeoutError): release.finalize(context)
            self.assertEqual(model.read_json(Path(tmp)/'publication.json')['status'],'partial-failure')
        site.assert_not_called(); endpoint.finish.assert_not_called()

    def test_deployment_staging_writes_only_private_digest(self):
        record = {'target':'web-x86', 'digest':'sha256:'+'b'*64, 'source':''}
        info = {'Digest':record['digest'], 'Architecture':'amd64', 'Os':'linux',
                'Labels':{'org.opencontainers.image.revision':C['source_sha'], 'org.opencontainers.image.version':C['version']}}
        with patch.dict(os.environ, {'REGISTRY_PRIVATE_PREFIX':'private.test'}), \
                patch.object(registry,'optional_tag',return_value=None), patch.object(registry,'restore_archive',return_value=Path('image')), \
                patch.object(registry,'inspect',return_value=info), patch.object(registry,'copy') as copy_image:
            self.assertEqual(registry.deployment_image(record,C),IMAGE)
        self.assertEqual(copy_image.call_count,1)
        self.assertTrue(copy_image.call_args.args[1].startswith('private.test/password-xl-web-x86:deploy-'))
        self.assertNotIn('latest',copy_image.call_args.args[1])

    def test_oss_diagnostic_cannot_fail_origin_publication(self):
        with patch.object(oss.urllib.request,'urlopen',side_effect=OSError):
            self.assertEqual(oss.public_verify({'public_url':'https://example.test/'}, C)['status'],'unavailable')
