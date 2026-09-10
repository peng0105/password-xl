"""Speedups must retain source, checksum, concurrency and cancellation boundaries."""
import hashlib
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import cache
import model
import publish
import registry
import source
import workers
import release


class Cache(unittest.TestCase):
    def test_cache_size_bound_does_not_touch_other_project_files(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'RELEASE_CACHE_ROOT': tmp, 'RELEASE_CACHE_MAX_BYTES':'8'}):
            unrelated=Path(tmp)/'other-project'
            unrelated.write_bytes(b'do not delete')
            first=cache.remember(b'12345678')
            previous=time.time()-1
            os.utime(Path(tmp)/'blobs'/first,(previous,previous))
            second=cache.remember(b'abcdefgh')
            self.assertIsNone(cache.load(first))
            self.assertEqual(cache.load(second),b'abcdefgh')
            self.assertEqual(unrelated.read_bytes(),b'do not delete')

    def test_cached_bytes_are_hashed_and_corruption_is_a_miss(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'RELEASE_CACHE_ROOT': tmp}):
            digest = cache.remember(b'original')
            self.assertEqual(cache.load(digest), b'original')
            (Path(tmp) / 'blobs' / digest).write_bytes(b'corrupt')
            self.assertIsNone(cache.load(digest))
            with self.assertRaises(ValueError):
                cache.load('../escape')

    def test_proof_tracks_asset_identity_and_ignores_download_count(self):
        asset = {'id':1, 'uuid':'one', 'name':'app.exe', 'size':8, 'created_at':'today'}
        def key(value):
            return cache.asset_key('https://git.example', 'owner/repo', 7, value)
        first = key(asset)
        self.assertEqual(first, key({**asset, 'download_count':100}))
        for change in ({'id':2}, {'uuid':'two'}, {'size':9}, {'name':'other'}, {'updated_at':'later'}):
            self.assertNotEqual(first, key({**asset, **change}))
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'RELEASE_CACHE_ROOT': tmp}):
            digest = cache.remember(b'original', first)
            self.assertEqual(cache.known_digest(first), digest)
            self.assertIsNone(cache.known_digest(key({**asset, 'id':2})))

    def test_persisted_cache_does_not_replace_source_receipt_check(self):
        endpoint = Mock()
        endpoint.get_json.return_value = {'version':'1.5.0', 'source_sha':'wrong'}
        with patch.object(publish, 'releases', return_value=[endpoint, endpoint]), patch.object(cache, 'load') as restore:
            with self.assertRaisesRegex(ValueError, 'Receipt source mismatch'):
                publish.restore_target({'version':'1.5.0', 'source_sha':'a'*40}, 'exe', Path('unused'))
            restore.assert_not_called()


class Assets(unittest.TestCase):
    def endpoint(self, data):
        endpoint = publish.Release.__new__(publish.Release)
        endpoint.github = True
        endpoint.provider = 'github'
        endpoint.api = Mock(base='https://api.github.com')
        endpoint.repo = 'owner/repo'
        endpoint.path = '/repos/owner/repo'
        endpoint.release = {'id':7}
        endpoint._contents = {}
        endpoint._assets = {'app.exe': {'id':1, 'name':'app.exe', 'size':len(data),
                                        'created_at':'today', 'digest':'sha256:'+hashlib.sha256(data).hexdigest()}}
        return endpoint

    def test_server_digest_avoids_download_but_rejects_different_bytes(self):
        endpoint = self.endpoint(b'original')
        endpoint.content = Mock(side_effect=AssertionError('Unnecessary binary download'))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'app.exe'
            path.write_bytes(b'original')
            endpoint.put(path)
            path.write_bytes(b'other')
            with self.assertRaisesRegex(ValueError, 'Immutable release asset conflict'):
                endpoint.put(path)
        endpoint.api.request.assert_not_called()

    def test_attachment_listing_is_reused_with_explicit_refresh(self):
        endpoint = self.endpoint(b'original')
        endpoint._assets = None
        endpoint.assets_path = '/assets'
        endpoint.api.pages.return_value = [{'name':'one'}]
        self.assertEqual(endpoint.assets(), {'one':{'name':'one'}})
        endpoint.assets()
        endpoint.api.pages.assert_called_once()
        endpoint.assets(refresh=True)
        self.assertEqual(endpoint.api.pages.call_count, 2)

    def test_matching_reservation_is_not_uploaded_again(self):
        endpoint = self.endpoint(b'original')
        endpoint.context = {'version':'1.5.0', 'source_sha':'a'*40}
        endpoint.get_json = Mock(return_value=endpoint.context)
        endpoint.put = Mock()
        endpoint.reserve()
        endpoint.put.assert_not_called()


class Distribution(unittest.TestCase):
    def test_matching_latest_requires_no_copy(self):
        record = {'digest':'sha256:abc', 'destinations':['registry/app:1.5.0']}
        with patch.object(registry, 'optional_tag', return_value={'Digest':'sha256:abc'}), \
                patch.object(registry, 'copy') as copy:
            result = registry.promote_latest(record, {'version':'1.5.0'})
        self.assertEqual(result, [{'image':'registry/app:latest','status':'unchanged'}])
        copy.assert_not_called()

    def test_latest_uses_same_repository_blob_source(self):
        record = {'digest':'sha256:abc','source':'far-away/app@sha256:abc','destinations':['registry/app:1.5.0']}
        with patch.object(registry, 'optional_tag', return_value=None), \
                patch.object(registry, 'inspect', return_value={'Digest':'sha256:abc'}), \
                patch.object(registry, 'copy') as copy:
            registry.promote_latest(record, {'version':'1.5.0'})
        copy.assert_called_once_with('docker://registry/app@sha256:abc', 'registry/app:latest')

    def test_registries_overlap_and_existing_tags_are_inspected_once(self):
        barrier = threading.Barrier(3, timeout=5)
        context = {'version':'1.5.0','source_sha':'a'*40}
        info = {'Digest':'sha256:abc','Architecture':'arm64','Os':'linux','Labels':{
            'org.opencontainers.image.version':'1.5.0','org.opencontainers.image.revision':'a'*40}}
        def probe(reference):
            barrier.wait()
            return info
        record = {'target':'web-arm','source':'registry/app@sha256:abc','digest':'sha256:abc'}
        with patch.object(registry,'inspect',return_value=info) as inspect, \
                patch.object(registry,'optional_tag',side_effect=probe), \
                patch.object(registry,'prefix',side_effect=lambda value:'registry/'+value), \
                patch.object(registry,'copy') as copy:
            result = registry.distribute(record, context)
        self.assertEqual(len(result['destinations']),3)
        inspect.assert_called_once()
        copy.assert_not_called()


class DefaultsAndWorker(unittest.TestCase):
    def test_workflow_branch_and_source_are_pinned_separately(self):
        api = Mock()
        def request(method,path,data=None):
            if path.endswith('/git/ref/heads/master'):
                return {'object':{'sha':'b'*40}}
            if path.endswith('/dispatches'):
                self.assertEqual(data['ref'],'master')
                payload=json.loads(data['inputs']['payload'])
                self.assertEqual(payload['source_sha'],'a'*40)
                self.assertEqual(payload['workflow_sha'],'b'*40)
                return {'workflow_run_id':42}
            if path.endswith('/actions/runs/42'):
                return {'head_sha':'changed','status':'completed','conclusion':'success'}
            return {}
        api.request.side_effect=request
        with tempfile.TemporaryDirectory() as tmp, patch.object(workers,'OUT',Path(tmp)), \
                patch.object(workers,'github',return_value=api), patch.object(workers,'cancel') as cancel, \
                patch.dict(os.environ,{'GITHUB_REPO':'owner/repo'}):
            with self.assertRaisesRegex(ValueError,'workflow changed'):
                workers.dispatch({'source_sha':'a'*40,'version':'1.5.0'},'desktop-linux',['rpm'])
        self.assertEqual(cancel.call_args.args[0]['run_id'],42)
        api.download.assert_not_called()

    def test_removed_parameters_cannot_override_master_or_full_domain(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(source,'OUT',Path(tmp)), \
                patch.dict(os.environ, {'SOURCE_REF':'bad', 'ANDROID_REF':'bad','PROFILE':'custom','TARGETS':'exe',
                  'UPDATE_LATEST':'false','RELEASE_NOTES':'old','GITEA_SOURCE_URL':'https://git.example/repo',
                  'GITEA_TOKEN':'fixture','DEPLOY_OSS':'false'},clear=True), \
                patch.object(source,'pin',return_value='a'*40) as pin, patch.object(source,'git'), \
                patch.object(source,'read_json',return_value={'version':'1.5.0'}), \
                patch.object(source,'android_checkout',return_value=(Path(tmp),'b'*40)) as android:
            result = source.prepare('all')
        self.assertEqual(pin.call_args.args[1],'master')
        android.assert_called_once_with('master')
        self.assertEqual(result['targets'], model.TARGETS)
        self.assertTrue(result['update_latest'])
        self.assertEqual(result['release_notes'],'')

    def test_cancelled_parallel_group_does_not_dispatch_another_job(self):
        stop = threading.Event()
        stop.set()
        with patch.object(workers,'github') as github:
            with self.assertRaisesRegex(ValueError,'cancelled'):
                workers.dispatch({},'desktop-linux',['rpm'],cancel_event=stop)
            github.assert_not_called()


class ParallelWorkers(unittest.TestCase):
    def test_three_desktop_workers_start_together(self):
        barrier=threading.Barrier(3,timeout=5)
        def consume(context,task,targets,**kwargs):
            barrier.wait()
            return {}, Path('unused'), {'task':task}, [{'target':t,'name':t,'sha256':'a'*64} for t in targets]
        context={'version':'1.5.0','source_sha':'a'*40,'android_sha':None,
                 'targets':model.DOMAINS['desktop'],'deploy_oss':False}
        with tempfile.TemporaryDirectory() as tmp, patch.object(release,'OUT',Path(tmp)), \
                patch.object(release,'consume_worker',side_effect=consume), \
                patch.object(publish,'releases',return_value=[Mock(),Mock()]), \
                patch.object(publish,'restore_target',return_value=None), \
                patch.object(publish,'save_checkpoint'), patch.object(publish,'publish_target'):
            result=release.domain(context,'desktop')
        self.assertEqual(result['status'],'success')
        self.assertEqual(result['targets'],model.DOMAINS['desktop'])

    def test_failed_worker_signals_running_siblings_before_join(self):
        barrier=threading.Barrier(3,timeout=5)
        stopped=[]
        def consume(context,task,targets,cancel_event=None):
            barrier.wait()
            if task=='desktop-linux':
                raise ValueError('planned worker failure')
            stopped.append(cancel_event.wait(5))
            raise ValueError('cancelled sibling')
        context={'version':'1.5.0','source_sha':'a'*40,'targets':model.DOMAINS['desktop']}
        with tempfile.TemporaryDirectory() as tmp, patch.object(release,'OUT',Path(tmp)), \
                patch.object(release,'consume_worker',side_effect=consume), \
                patch.object(publish,'releases',return_value=[Mock(),Mock()]), \
                patch.object(publish,'restore_target',return_value=None):
            with self.assertRaisesRegex(ValueError,'planned worker failure'):
                release.domain(context,'desktop')
        self.assertEqual(stopped,[True,True])


if __name__ == '__main__':
    unittest.main()
