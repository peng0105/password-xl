"""Contract tests for failure handling, immutable publication and promotion gates."""
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import model
import publish
import registry
import release
import oss
import workers
import builds
from api import Api, ApiError


def context(targets=None):
    return {'version': '1.5.0', 'source_sha': 'a' * 40, 'android_sha': None,
            'targets': targets or ['web-x86'], 'update_latest': True, 'deploy_oss': False}


def completed(target):
    return {**model.identity(context()), 'status': 'success', 'targets': [target],
            'files': [], 'images': [], 'worker_runs': []}


class Contracts(unittest.TestCase):
    def test_sixteen_unique_targets(self):
        self.assertEqual((len(model.TARGETS), len(set(model.TARGETS)), len(model.IMAGE_TARGETS)), (16, 16, 6))

    def test_android_version_bounds_and_order(self):
        self.assertEqual(model.version_code('1.5.0'), 1005000)
        self.assertLess(model.version_code('1.999.999'), model.version_code('2.0.0'))
        for invalid in ('v1.5.0', '1.5.0-rc.1', '01.5.0', '1.1000.0', '2101.0.0', '0.0.0'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                model.version_code(invalid)

    def test_legacy_names_stay_x86(self):
        self.assertEqual(model.image_names('web-x86', 'tencent'),
                         ['password-xl-web-x86', 'password-xl-web', 'password-xl-service-web'])
        self.assertEqual(model.image_names('service-jvm-arm', 'dockerhub'), ['password-xl-service-jvm-arm'])

    def test_merge_requires_all_selected_targets_same_identity(self):
        for results in ([completed('jar')], [completed('web-x86'), completed('web-x86')],
                        [{**completed('web-x86'), 'source_sha': 'b' * 40}],
                        [{**completed('web-x86'), 'status': 'failed'}]):
            with self.assertRaises(ValueError):
                model.merge_results(context(), results)

    def test_arch_must_match_labels_and_config(self):
        info = {'Architecture': 'arm64', 'Os': 'linux', 'Labels': {
            'org.opencontainers.image.revision': 'a' * 40, 'org.opencontainers.image.version': '1.5.0'}}
        registry.validate(info, context(), 'web-arm')
        with self.assertRaises(ValueError):
            registry.validate(info, context(), 'web-x86')

    def test_deterministic_archives_and_no_path_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            directory = root / 'dist'
            directory.mkdir()
            (directory / 'index.html').write_text('page')
            for suffix in ('.zip', '.tar.gz'):
                model.pack_directory(directory, root / ('one' + suffix))
                os.utime(directory / 'index.html', (1700000000, 1700000000))
                model.pack_directory(directory, root / ('two' + suffix))
                self.assertEqual(model.sha256(root / ('one' + suffix)), model.sha256(root / ('two' + suffix)))
            bad = root / 'bad.zip'
            with zipfile.ZipFile(bad, 'w') as bundle:
                bundle.writestr('../outside', 'bad')
            with self.assertRaises(ValueError):
                model.extract_zip(bad, root / 'out')
            self.assertFalse((root / 'outside').exists())

    def test_archive_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / 'bad.zip'
            with zipfile.ZipFile(bad, 'w') as bundle:
                item = zipfile.ZipInfo('link')
                item.external_attr = 0o120777 << 16
                bundle.writestr(item, '../../outside')
            with self.assertRaises(ValueError):
                model.extract_zip(bad, Path(tmp) / 'out')


class Publishing(unittest.TestCase):
    def test_existing_draft_is_found_without_creating_duplicate(self):
        api = Mock()
        api.maybe.return_value = None
        api.pages.return_value = [{'id': 12, 'tag_name': '1.5.0', 'draft': True}]
        with patch.object(publish, 'Api', return_value=api), \
                patch.dict(os.environ, {'GH_TOKEN': 'fixture', 'GITHUB_REPO': 'owner/repo'}):
            endpoint = publish.Release('github', context())
        self.assertEqual(endpoint.release['id'], 12)
        api.request.assert_not_called()

    def test_version_reservation_rejects_other_source(self):
        endpoint = publish.Release.__new__(publish.Release)
        endpoint.context = context()
        endpoint.get_json = Mock(return_value={'version': '1.5.0', 'source_sha': 'b' * 40})
        endpoint.put = Mock()
        with self.assertRaises(ValueError):
            endpoint.reserve()
        endpoint.put.assert_not_called()

    def test_same_asset_is_reused_different_bytes_rejected(self):
        endpoint = publish.Release.__new__(publish.Release)
        endpoint.assets = Mock(return_value={'app.exe': {'id': 1}})
        endpoint.content = Mock(return_value=b'existing')
        endpoint.known_digest = Mock(return_value=None)
        endpoint.api = Mock()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'app.exe'
            path.write_bytes(b'existing')
            endpoint.put(path)
            endpoint.api.request.assert_not_called()
            path.write_bytes(b'new')
            with self.assertRaises(ValueError):
                endpoint.put(path)
            endpoint.api.request.assert_not_called()

    def test_non_android_receipts_do_not_bind_future_android_commit(self):
        args = ('web-x86', [], [], [])
        first = publish.target_receipt(context(), *args)
        second = publish.target_receipt({**context(), 'android_sha': 'c' * 40}, *args)
        self.assertEqual(first, second)

    def test_resume_repairs_one_provider_without_rebuild(self):
        data = b'original signed bytes'
        file = {'name': 'app.exe', 'sha256': hashlib.sha256(data).hexdigest(), 'target': 'exe'}
        receipt = publish.target_receipt(context(), 'exe', [file], [], [])
        first, second = Mock(), Mock()
        first.get_json.return_value = receipt
        second.get_json.return_value = None
        first.assets.return_value = {file['name']: {'id': 1}}
        first.content.return_value = data
        second.assets.return_value = {}
        with tempfile.TemporaryDirectory() as tmp, patch.object(publish, 'releases', return_value=[first, second]):
            restored = publish.restore_target(context(), 'exe', tmp)
            self.assertEqual(restored, receipt)
            self.assertEqual((Path(tmp) / 'app.exe').read_bytes(), data)

    def test_resume_rejects_checksum_corruption(self):
        file = {'name': 'app.exe', 'sha256': '0' * 64}
        receipt = publish.target_receipt(context(), 'exe', [file], [], [])
        endpoint = Mock()
        endpoint.get_json.return_value = receipt
        endpoint.assets.return_value = {'app.exe': {'id': 1}}
        endpoint.content.return_value = b'corrupt'
        with tempfile.TemporaryDirectory() as tmp, patch.object(publish, 'releases', return_value=[endpoint, endpoint]):
            with self.assertRaises(ValueError):
                publish.restore_target(context(), 'exe', tmp)

    def test_supplemental_manifest_includes_old_targets(self):
        receipts = {f'receipt-{t}.json': publish.target_receipt(context(), t, [], [], []) for t in ('jar', 'web-x86')}
        endpoint = Mock()
        endpoint.get_json.side_effect = lambda name: receipts.get(name)
        with tempfile.TemporaryDirectory() as tmp, patch.object(publish, 'OUT', Path(tmp)), \
                patch.object(publish, 'releases', return_value=[endpoint, endpoint]):
            _, manifest = publish.combined_manifest(context(), completed('web-x86'))
            self.assertEqual(set(manifest['targets']), {'jar', 'web-x86'})
            self.assertTrue((Path(tmp) / 'metadata/SHA256SUMS').exists())

    def test_failed_selection_never_promotes_or_publishes(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'OUT', Path(tmp)), \
                patch.object(publish, 'combined_manifest') as manifests, patch.object(registry, 'promote_latest') as latest:
            model.write_json(Path(tmp) / 'result-web.json', {**completed('web-x86'), 'status': 'failed'})
            with self.assertRaises(ValueError):
                release.finalize(context())
            latest.assert_not_called()
            manifests.assert_not_called()

    def test_oss_disabled_has_no_site_effect(self):
        endpoint = Mock(provider='github')
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'OUT', Path(tmp)), \
                patch.object(publish, 'combined_manifest', return_value=([endpoint], completed('web-x86'))), \
                patch.object(oss, 'deploy') as deployment:
            model.write_json(Path(tmp) / 'result-web.json', completed('web-x86'))
            release.finalize(context())
            deployment.assert_not_called()
            endpoint.finish.assert_called_once()
            self.assertEqual(model.read_json(Path(tmp) / 'publication.json')['status'], 'success')

    def test_failure_in_second_release_is_partial_failure(self):
        first, second = Mock(provider='github'), Mock(provider='gitea')
        second.finish.side_effect = RuntimeError('network')
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'OUT', Path(tmp)), \
                patch.object(publish, 'combined_manifest', return_value=([first, second], completed('web-x86'))):
            model.write_json(Path(tmp) / 'result-web.json', completed('web-x86'))
            with self.assertRaises(RuntimeError):
                release.finalize(context())
            state = model.read_json(Path(tmp) / 'publication.json')
            self.assertEqual(state['status'], 'partial-failure')
            self.assertEqual(state['steps']['github'], 'public')

    def test_report_upload_failure_cannot_leave_success_status(self):
        endpoint = Mock(provider='github')
        endpoint.put.side_effect = RuntimeError('network')
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'OUT', Path(tmp)), \
                patch.object(publish, 'combined_manifest', return_value=([endpoint], completed('web-x86'))):
            model.write_json(Path(tmp) / 'result-web.json', completed('web-x86'))
            with self.assertRaises(ValueError):
                release.finalize(context())
            self.assertEqual(model.read_json(Path(tmp) / 'publication.json')['status'], 'partial-failure')


class Distribution(unittest.TestCase):
    def test_unversioned_legacy_is_preserved_without_migration_version(self):
        record = {'source': 'registry/app@sha256:123', 'digest': 'sha256:123', 'destinations': ['registry/app:1.5.0']}
        with patch.dict(os.environ, {}, clear=True), patch.object(registry, 'optional_tag', return_value={'Labels': {}}), \
                patch.object(registry, 'copy') as copy:
            statuses = registry.promote_latest(record, context())
            copy.assert_not_called()
            self.assertEqual(statuses[0]['status'], 'kept-unversioned-legacy')

    def test_old_release_cannot_regress_latest(self):
        record = {'source': 'registry/app@sha256:123', 'digest': 'sha256:123', 'destinations': ['registry/app:1.5.0']}
        with patch.object(registry, 'optional_tag', return_value={'Labels': {'org.opencontainers.image.version': '1.6.0'}}), \
                patch.object(registry, 'copy') as copy:
            statuses = registry.promote_latest(record, context())
            copy.assert_not_called()
            self.assertEqual(statuses[0]['status'], 'kept-newer-version')

    def test_version_tag_digest_conflict_fails_before_copy(self):
        record = {'target': 'web-x86', 'source': 'registry/app@sha256:123', 'digest': 'sha256:123'}
        info = {'Architecture': 'amd64', 'Os': 'linux', 'Labels': {
            'org.opencontainers.image.version': '1.5.0', 'org.opencontainers.image.revision': 'a' * 40}}
        with patch.object(registry, 'inspect', return_value=info), patch.object(registry, 'prefix', return_value='registry/ns'), \
                patch.object(registry, 'optional_tag', return_value={'Digest': 'sha256:different'}), \
                patch.object(registry, 'copy') as copy:
            with self.assertRaises(ValueError):
                registry.distribute(record, context())
            copy.assert_not_called()

    def test_auth_error_is_not_treated_as_missing_tag(self):
        with patch.dict(os.environ, {'REGISTRY_AUTH_FILE': 'auth.json'}), \
                patch.object(registry.subprocess, 'run', return_value=Mock(returncode=1, stderr='unauthorized')):
            with self.assertRaises(RuntimeError):
                registry.optional_tag('registry/app:1.5.0')


class Site(unittest.TestCase):
    def test_legacy_snapshot_is_complete_and_does_not_write_live_files(self):
        contents = {'index.html': b'old html', 'assets/old.js': b'old js'}
        storage = Mock()
        storage.exists.return_value = False
        storage.names.return_value = list(contents)
        storage.get.side_effect = contents.__getitem__
        result = oss.snapshot_existing(storage)
        self.assertTrue(result['deployment'].startswith('legacy-'))
        writes = [c.args[0] for c in storage.put.call_args_list]
        self.assertEqual(len(writes), 4)
        self.assertTrue(all(name.startswith('_releases/') for name in writes))
        self.assertEqual(writes[-1], '_releases/current.json')

    def test_legacy_snapshot_detects_concurrent_live_change(self):
        storage = Mock()
        storage.exists.return_value = False
        storage.names.return_value = ['index.html']
        storage.get.side_effect = [b'old', b'changed']
        with self.assertRaisesRegex(ValueError, 'changed during backup'):
            oss.snapshot_existing(storage)
        self.assertNotIn('_releases/current.json', [c.args[0] for c in storage.put.call_args_list])

    def test_missing_oss_configuration_fails_before_storage(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'OSS_BUCKET'):
                oss.configuration()

    def test_activation_assets_before_html_and_refresh_before_public_check(self):
        calls = []
        contents = {'index.html': b'html', 'assets/app-12345678.js': b'js'}
        files = [{'name': key, 'sha256': hashlib.sha256(value).hexdigest()} for key, value in contents.items()]
        storage = Mock()
        storage.get.side_effect = lambda name: contents[name.split('/files/')[1]]
        storage.put.side_effect = lambda name, *args: calls.append(name)
        with patch.object(oss, 'cdn_refresh', side_effect=lambda config: calls.append('refresh') or ['1']), \
                patch.object(oss, 'public_verify', side_effect=lambda *args: calls.append('verify')):
            oss.activate(storage, {}, {'files': files, 'deployment': 'test'}, '_releases/test')
        self.assertEqual(calls, ['assets/app-12345678.js', 'index.html', 'refresh', 'verify', '_releases/current.json'])

    def test_bad_rollback_bytes_never_activate(self):
        storage = Mock()
        storage.get.return_value = b'corrupt'
        with self.assertRaises(ValueError):
            oss.activate(storage, {}, {'files': [{'name': 'index.html', 'sha256': '0' * 64}]}, 'backup')
        storage.put.assert_not_called()


class GradleMirror(unittest.TestCase):
    def check_mirror(self, url, checksum=True):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module = root / 'password-xl-service'
            directory = module / 'gradle/wrapper'
            directory.mkdir(parents=True)
            (module / 'gradlew').touch()
            (directory / 'gradle-wrapper.jar').write_bytes(b'wrapper fixture')
            properties = 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.6.1-bin.zip\n'
            if checksum:
                properties += 'distributionSha256Sum=' + 'a' * 64 + '\n'
            original = directory / 'gradle-wrapper.properties'
            original.write_text(properties)
            with patch.dict(os.environ, {'GRADLE_DISTRIBUTION_URL': url}, clear=True), \
                    patch.object(builds, 'ROOT', root), patch.object(builds, 'OUT', root / '.release'), \
                    patch.object(builds, 'frontend', return_value=root / 'dist'), patch.object(builds, 'run') as execute:
                builds.gradle(context(), ['build'])
                mirrored = (root / '.release/gradle-wrapper/gradle-wrapper.properties').read_text()
                self.assertIn('distributionSha256Sum=' + 'a' * 64, mirrored)
                self.assertIn(url.replace(':', '\\:'), mirrored)
                self.assertEqual(original.read_text(), properties)
                self.assertIn('org.gradle.wrapper.GradleWrapperMain', execute.call_args.args[0])

    def test_internal_mirror_keeps_original_checksum_and_source(self):
        self.check_mirror('https://mirror.example/gradle-9.6.1-bin.zip')

    def test_mirror_cannot_change_gradle_version(self):
        with self.assertRaises(ValueError):
            self.check_mirror('https://mirror.example/gradle-9.7.1-bin.zip')

    def test_mirror_requires_pinned_checksum(self):
        with self.assertRaises(ValueError):
            self.check_mirror('https://mirror.example/gradle-9.6.1-bin.zip', checksum=False)


class WorkersAndApi(unittest.TestCase):
    def test_api_rejects_cross_host_auth(self):
        with self.assertRaises(ValueError):
            Api('https://api.github.com', 'secret', True).request('GET', 'https://elsewhere.example/asset')

    def test_error_message_redacts_query(self):
        self.assertNotIn('secret', str(ApiError(403, 'GET', 'https://api.example/path?token=secret')))

    def test_cancel_exact_recorded_run(self):
        api = Mock()
        api.request.return_value = {'status': 'in_progress'}
        with patch.object(workers, 'github', return_value=api):
            workers.cancel({'repo': 'owner/project', 'run_id': 123})
        api.request.assert_called_with('POST', '/repos/owner/project/actions/runs/123/cancel')

    def test_find_run_never_selects_other_request(self):
        api = Mock()
        api.request.return_value = {'workflow_runs': [{'id': 1, 'display_title': 'Jenkins other'},
                                                     {'id': 2, 'display_title': 'Jenkins chosen'}]}
        self.assertEqual(workers.find_run(api, {'repo': 'owner/repo', 'workflow': 'w.yml', 'request_id': 'chosen'}), 2)


if __name__ == '__main__':
    unittest.main()
