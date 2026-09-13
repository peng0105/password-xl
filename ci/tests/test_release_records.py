import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
from api import ApiError
import clean_release_assets
import publish
from release_records import Records


class Storage:
    def __init__(self):
        self.objects = {}
    def maybe(self, path):
        return self.objects.get(path)
    def pages(self, path):
        return [{'id': i, 'name': name.rsplit('/', 1)[-1]} for i, name in enumerate(self.objects)]
    def request(self, method, path, data=None, headers=None, binary=False):
        if method == 'GET':
            return self.pages(path)
        if path in self.objects:
            raise ApiError(409, method, path)
        self.objects[path] = json.loads(data)


class InternalRecords(unittest.TestCase):
    def setUp(self):
        self.api = Storage()
        for p in (patch.dict(os.environ, {'GITEA_URL':'https://gitea.example', 'GITEA_REPO':'owner/repo', 'GITEA_TOKEN':'test'}),
                  patch('release_records.Api', return_value=self.api)):
            p.start(); self.addCleanup(p.stop)
        self.records = Records('github', '1.5.1')

    def test_immutable_binding_conflict_is_preserved(self):
        self.records.put('release-source.json', {'sha':'a'})
        with self.assertRaisesRegex(ValueError, 'conflict'):
            self.records.put('release-source.json', {'sha':'b'})
        self.assertEqual(self.records.get('release-source.json'), {'sha':'a'})

    def test_mutable_records_are_append_only_and_latest_is_server_order(self):
        self.records.put('publication.json', {'status':'pending'})
        self.records.put('publication.json', {'status':'success'})
        self.records.put('publication.json', {'status':'success'})
        self.assertEqual(len(self.api.objects), 2)
        self.assertEqual(self.records.get('publication.json'), {'status':'success'})

    def test_provider_records_remain_independent(self):
        self.records.put('receipt-web-x86.json', {'sha':'a'})
        Records('gitea', '1.5.1').put('receipt-web-x86.json', {'sha':'b'})
        self.assertEqual(self.records.get('receipt-web-x86.json'), {'sha':'a'})

    def test_missing_record_does_not_probe_nonexistent_file_url(self):
        with patch.object(self.api, 'maybe', wraps=self.api.maybe) as read:
            self.assertIsNone(self.records.get('release-source.json'))
            read.assert_not_called()

    def test_large_package_is_read_once_without_fake_pagination(self):
        values = [{'id':i, 'name':'unrelated-' + str(i) + '.json'} for i in range(150)]
        with patch.object(self.api, 'request', return_value=values) as listing:
            self.assertIsNone(self.records.get('release-source.json'))
            listing.assert_called_once_with('GET', self.records.files)

    def test_failed_backup_never_deletes_public_attachment(self):
        store, remove = Mock(), Mock()
        store.get.return_value = None
        with self.assertRaisesRegex(ValueError, 'retained'):
            clean_release_assets.migrate_json(store, 'release-source.json', b'{"sha":"a"}', remove)
        remove.assert_not_called()

    def test_migration_deletes_only_after_verified_readback(self):
        remove = Mock()
        clean_release_assets.migrate_json(self.records, 'release-source.json', b'{"sha":"a"}', remove)
        remove.assert_called_once()
        self.assertEqual(self.records.get('release-source.json'), {'sha':'a'})

    def test_json_put_does_not_use_release_asset_api(self):
        endpoint = publish.Release.__new__(publish.Release)
        endpoint.provider, endpoint.context, endpoint._contents = 'github', {'version':'1.5.1'}, {}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'release-source.json'
            path.write_text('{"sha":"a"}')
            endpoint.put(path)
            self.assertEqual(endpoint.get_json(path.name), {'sha':'a'})

    def test_public_checksums_exclude_internal_manifest(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(publish, 'OUT', Path(directory)):
            _, sums = publish.save_manifest({'files':[{'name':'app.exe', 'sha256':'abc'}]})
            self.assertEqual(sums.read_text(), 'abc  app.exe\n')
