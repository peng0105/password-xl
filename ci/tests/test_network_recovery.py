"""Exercise interrupted transfers without weakening immutable publication checks."""
import hashlib
import http.client
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import api
import publish
import registry


class HttpRecovery(unittest.TestCase):
    def test_get_retries_connection_loss_and_incomplete_body(self):
        opener = Mock()
        opener.open.side_effect = [urllib.error.URLError('EOF'),
                                  http.client.IncompleteRead(b'partial'), io.BytesIO(b'{"ok": true}')]
        with patch.object(api.urllib.request, 'build_opener', return_value=opener), patch.object(api.time, 'sleep'):
            self.assertEqual(api.Api('https://api.example', 'fixture').request('GET', '/item'), {'ok': True})
        self.assertEqual(opener.open.call_count, 3)

    def test_unknown_post_outcome_is_not_repeated_by_http_client(self):
        opener = Mock()
        opener.open.side_effect = TimeoutError('write timed out')
        with patch.object(api.urllib.request, 'build_opener', return_value=opener), patch.object(api.time, 'sleep') as sleep:
            with self.assertRaises(TimeoutError):
                api.Api('https://api.example', 'fixture').request('POST', '/dispatch', {}, timeout=600)
        opener.open.assert_called_once()
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 600)
        sleep.assert_not_called()

    def test_redirect_download_retry_strips_credentials(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.HTTPError('https://api.example/asset', 302, 'redirect',
                                                        {'Location': 'https://objects.example/file'}, None)
        with patch.object(api.urllib.request, 'build_opener', return_value=opener), \
                patch.object(api.urllib.request, 'urlopen', side_effect=[TimeoutError(), io.BytesIO(b'complete')]) as download, \
                patch.object(api.time, 'sleep'):
            result = api.Api('https://api.example', 'secret').request('GET', '/asset', binary=True)
        self.assertEqual(result, b'complete')
        self.assertEqual(download.call_count, 2)
        download.assert_called_with('https://objects.example/file', timeout=120)

    def test_get_retries_are_bounded_and_auth_errors_fail_immediately(self):
        for error, calls in [(TimeoutError(), 4),
                             (urllib.error.HTTPError('https://api.example/item', 401, 'denied', {}, None), 1)]:
            with self.subTest(error=type(error).__name__):
                opener = Mock()
                opener.open.side_effect = error
                with patch.object(api.urllib.request, 'build_opener', return_value=opener), patch.object(api.time, 'sleep'):
                    with self.assertRaises((TimeoutError, api.ApiError)):
                        api.Api('https://api.example', 'fixture').request('GET', '/item')
                self.assertEqual(opener.open.call_count, calls)


class UploadRecovery(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / 'app.snap'
        self.path.write_bytes(b'original signed package')
        self.asset = {'id': 7, 'name': self.path.name, 'size': self.path.stat().st_size,
                      'state': 'uploaded', 'digest': 'sha256:' + hashlib.sha256(self.path.read_bytes()).hexdigest()}
        self.endpoint = publish.Release.__new__(publish.Release)
        self.endpoint.github = True
        self.endpoint.provider = 'github'
        self.endpoint.path = '/repos/owner/repo'
        self.endpoint.repo = 'owner/repo'
        self.endpoint.release = {'id': 5}
        self.endpoint.assets_path = '/repos/owner/repo/releases/5/assets'
        self.endpoint.api = Mock(base='https://api.github.com')
        self.endpoint._assets = {}
        self.endpoint._contents = {}
        for patcher in [patch.object(publish.time, 'sleep'), patch.object(publish.cache, 'remember')]:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_timeout_after_success_reuses_verified_remote_asset(self):
        self.endpoint.api.pages.return_value = [self.asset]
        with patch.object(self.endpoint, 'upload', side_effect=TimeoutError()) as upload:
            self.endpoint.put(self.path)
        upload.assert_called_once()
        self.endpoint.api.request.assert_not_called()

    def test_timeout_before_creation_retries_original_bytes(self):
        self.endpoint.api.pages.return_value = []
        with patch.object(self.endpoint, 'upload', side_effect=[TimeoutError(), self.asset]) as upload:
            self.endpoint.put(self.path)
        self.assertEqual(upload.call_count, 2)
        self.assertEqual(upload.call_args_list[0], upload.call_args_list[1])

    def test_remote_checksum_conflict_is_never_replaced(self):
        self.endpoint.api.pages.return_value = [{**self.asset, 'digest': 'sha256:' + 'a' * 64}]
        with patch.object(self.endpoint, 'upload', side_effect=TimeoutError()) as upload:
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                self.endpoint.put(self.path)
        upload.assert_called_once()
        self.endpoint.api.request.assert_not_called()

    def test_only_empty_github_starter_is_removed_before_retry(self):
        self.endpoint.api.pages.return_value = [{**self.asset, 'state': 'starter', 'size': 0}]
        with patch.object(self.endpoint, 'upload', side_effect=[api.ApiError(502, 'POST', '/assets'), self.asset]):
            self.endpoint.put(self.path)
        self.endpoint.api.request.assert_called_once_with('DELETE', '/repos/owner/repo/releases/assets/7')

    def test_nonempty_incomplete_asset_is_not_deleted(self):
        self.endpoint.api.pages.return_value = [{**self.asset, 'state': 'starter', 'size': 1}]
        with patch.object(self.endpoint, 'upload', side_effect=TimeoutError()):
            with self.assertRaisesRegex(ValueError, 'metadata mismatch'):
                self.endpoint.put(self.path)
        self.endpoint.api.request.assert_not_called()

    def test_retries_are_bounded(self):
        self.endpoint.api.pages.return_value = []
        with patch.object(self.endpoint, 'upload', side_effect=TimeoutError()) as upload:
            with self.assertRaises(TimeoutError):
                self.endpoint.put(self.path)
        self.assertEqual(upload.call_count, 4)

    def test_permission_failure_is_not_retried(self):
        with patch.object(self.endpoint, 'upload', side_effect=api.ApiError(403, 'POST', '/assets')) as upload:
            with self.assertRaises(api.ApiError):
                self.endpoint.put(self.path)
        upload.assert_called_once()
        self.endpoint.api.pages.assert_not_called()

    def test_both_providers_use_separate_upload_timeout(self):
        with patch.dict(os.environ, {'GH_TOKEN': 'fixture', 'RELEASE_UPLOAD_TIMEOUT_SECONDS': '600'}), \
                patch.object(publish, 'Api', return_value=self.endpoint.api):
            for github in [True, False]:
                self.endpoint.github = github
                self.endpoint.upload(self.path)
                self.assertEqual(self.endpoint.api.request.call_args.kwargs['timeout'], 600)


class RegistryRecovery(unittest.TestCase):
    def test_inspection_does_not_request_unneeded_repository_tags(self):
        with patch.dict(os.environ, {'REGISTRY_AUTH_FILE': 'auth.json'}), \
                patch.object(registry, 'run', return_value=json.dumps({'Digest': 'sha256:abc'})) as run:
            self.assertEqual(registry.inspect('docker://registry/app:1.5.14')['Digest'], 'sha256:abc')
        args = run.call_args.args[0]
        self.assertIn('--no-tags', args)
        self.assertEqual(args[args.index('--retry-times') + 1], '3')

    def test_only_missing_manifest_is_absence_after_retries(self):
        for message, missing in [('manifest unknown', True), ('EOF', False), ('unauthorized', False)]:
            with self.subTest(message=message), patch.dict(os.environ, {'REGISTRY_AUTH_FILE': 'auth.json'}), \
                    patch.object(registry.subprocess, 'run', return_value=Mock(returncode=1, stderr=message)) as run:
                if missing:
                    self.assertIsNone(registry.optional_tag('registry/app:1.5.14'))
                else:
                    with self.assertRaises(RuntimeError):
                        registry.optional_tag('registry/app:1.5.14')
                self.assertIn('--no-tags', run.call_args.args[0])
                self.assertIn('--retry-times', run.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
