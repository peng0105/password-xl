"""Publication switches must not silently re-enable another external action."""
import itertools
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import image_state
import model
import oss
import publish
import registry
import release
import source
import transport
import workers


def context(**flags):
    return {'version':'1.5.0','source_sha':'a'*40,'android_sha':None,'targets':['web-x86'],
            'deploy_oss':False,'publish_release':False,'push_images':False,'sync_repos':False,
            'update_latest':True,**flags}


class Switches(unittest.TestCase):
    def test_disabled_release_never_constructs_remote_release(self):
        with patch.object(publish,'Release') as remote:
            self.assertEqual(publish.releases(context()),[])
        remote.assert_not_called()

    def test_all_sixteen_combinations_have_independent_final_effects(self):
        for deploy, publish_release, push, sync in itertools.product((False,True),repeat=4):
            c=context(deploy_oss=deploy,publish_release=publish_release,push_images=push,sync_repos=sync)
            endpoint=Mock(provider='github')
            image={'target':'web-x86','destinations':[]}
            merged={**model.identity(c),'targets':['web-x86'],'images':[image],'files':[],'worker_runs':[]}
            with self.subTest(flags=c), tempfile.TemporaryDirectory() as tmp, \
                    patch.object(release,'OUT',Path(tmp)), patch.object(release,'merge_results',return_value=merged), \
                    patch.object(publish,'combined_manifest',return_value=([endpoint] if publish_release else [],merged)), \
                    patch.object(registry,'promote_latest',return_value=[]) as latest, \
                    patch.object(oss,'deploy',return_value={'status':'success'}) as site:
                release.finalize(c)
                report=model.read_json(Path(tmp)/'publication.json')
            self.assertEqual(endpoint.finish.call_count,int(publish_release))
            self.assertEqual(endpoint.put.call_count,int(publish_release))
            self.assertEqual(site.call_count,int(deploy))
            self.assertEqual(latest.call_count,int(push))
            self.assertEqual(report['status'],'success')
            self.assertEqual(report['actions']['sync_repos'],sync)

    def test_reservation_does_not_sync_master_or_create_unselected_release(self):
        for pub,push in itertools.product((False,True),repeat=2):
            with patch.object(source,'synchronize') as tags, patch.object(source,'synchronize_repositories') as branches, \
                    patch.object(image_state,'check_source') as binding, \
                    patch.object(source,'check_primary_version') as check, patch.object(image_state,'reserve') as journal, \
                    patch.object(publish,'releases') as releases:
                release.reserve(context(publish_release=pub,push_images=push))
            self.assertEqual(tags.call_count,int(pub))
            self.assertEqual(binding.call_count,int(pub))
            self.assertEqual(releases.call_count,int(pub))
            self.assertEqual(journal.call_count,int(push))
            self.assertEqual(check.call_count,int(push))
            branches.assert_not_called()

    def test_disabled_sync_does_not_fetch_or_push_mirrors(self):
        with patch.object(source,'pin') as fetch, patch.object(source,'git') as git:
            source.synchronize_repositories(context())
        fetch.assert_not_called()
        git.assert_not_called()

    def test_disabled_image_push_skips_distribution_and_latest_even_with_saved_locations(self):
        record={'target':'web-x86','source':'private/image@sha256:abc','destinations':['private/image:1.5.0']}
        with patch.object(registry,'copy') as copy, patch.object(registry,'inspect') as inspect:
            self.assertIs(registry.distribute(record,context()),record)
            self.assertEqual(registry.promote_latest(record,context()),[])
        copy.assert_not_called()
        inspect.assert_not_called()

    def test_local_manifest_has_all_outputs_without_release_calls(self):
        c=context()
        current={**model.identity(c),'targets':['web-x86'],'files':[],'images':[],'worker_runs':[]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(publish,'OUT',Path(tmp)), patch.object(publish,'Release') as remote:
            endpoints,manifest=publish.combined_manifest(c,current)
            self.assertTrue((Path(tmp)/'metadata/SHA256SUMS').is_file())
        remote.assert_not_called()
        self.assertEqual(endpoints,[])
        self.assertEqual(manifest['status'],'built-and-verified')

    def test_no_push_uses_local_registry_auth_without_secrets(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(release,'OUT',Path(tmp)),patch.dict(os.environ,{},clear=True):
            release.auth(False)
            self.assertEqual(model.read_json(Path(tmp)/'private/docker/config.json'),{'auths':{}})


class WorkerInputs(unittest.TestCase):
    def test_native_frontend_transport_does_not_access_a_release(self):
        c=context()
        with tempfile.TemporaryDirectory() as tmp, patch.object(release,'OUT',Path(tmp)), \
                patch.object(publish,'Release') as endpoint, patch.object(workers,'dispatch',return_value=({'files':[]},Path(tmp),{})) as dispatch:
            (Path(tmp)/'frontend.zip').write_bytes(b'fixture')
            release.consume_worker(c,'native-arm',['service-arm'])
            self.assertEqual(dispatch.call_args.kwargs['input_files'],[Path(tmp)/'frontend.zip'])
        endpoint.assert_not_called()

    def test_input_checksum_and_package_identity_are_enforced(self):
        c={**context(),'request_id':'b'*32,'inputs':[{'name':'frontend.zip','size':7,'sha256':'c'*64}]}
        def download(path,dest):Path(dest).write_bytes(b'corrupt')
        with tempfile.TemporaryDirectory() as tmp, patch.object(transport,'client') as client, \
                patch.dict(os.environ,{'GITEA_REPO':'owner/repo'}):
            client.return_value.download.side_effect=download
            with self.assertRaisesRegex(ValueError,'checksum'):
                transport.download(c,'frontend.zip',Path(tmp)/'frontend.zip')
            with self.assertRaisesRegex(ValueError,'identity'):
                transport.cleanup({'request_id':'a'*32,'input_package':'b'*32})

    def test_failed_input_upload_does_not_cancel_an_unsubmitted_job(self):
        github=Mock()
        github.request.return_value={'object':{'sha':'b'*40}}
        with tempfile.TemporaryDirectory() as tmp, patch.object(workers,'OUT',Path(tmp)), \
                patch.object(workers,'github',return_value=github), patch.object(workers,'cancel') as cancel, \
                patch.object(transport,'upload',side_effect=ValueError('upload failed')), \
                patch.object(transport,'cleanup') as cleanup, patch.dict(os.environ,{'GITHUB_REPO':'owner/repo'}):
            with self.assertRaisesRegex(ValueError,'upload failed'):
                workers.dispatch(context(),'native-arm',['service-arm'],input_files=[Path('fixture')])
        cancel.assert_not_called()
        cleanup.assert_called_once()
        self.assertFalse(any(call.args[0]=='POST' for call in github.request.call_args_list))


class ImageReceipts(unittest.TestCase):
    def test_release_only_must_respect_an_earlier_image_only_version(self):
        c=context(publish_release=True)
        with patch.object(image_state,'get',return_value={'version':'1.5.0','source_sha':'b'*40}), \
                patch.object(source,'synchronize') as tags:
            with self.assertRaisesRegex(ValueError,'different image source'):
                release.reserve(c)
        tags.assert_not_called()

    def test_no_push_release_saves_validation_instead_of_claiming_image_publication(self):
        c=context(publish_release=True)
        image={'target':'web-x86','source':'','digest':'sha256:abc','destinations':[]}
        endpoint=Mock()
        endpoint.assets.return_value={}
        with tempfile.TemporaryDirectory() as tmp, patch.object(publish,'OUT',Path(tmp)), patch.object(image_state,'put') as journal:
            publish.publish_target(c,'web-x86',[],[image],[],[endpoint])
            names=[call.args[0].name for call in endpoint.put.call_args_list]
        self.assertEqual(names,['validated-web-x86.json'])
        journal.assert_not_called()

    def test_image_only_publication_reuses_immutable_journal_without_release(self):
        c=context(push_images=True)
        receipt=publish.target_receipt(c,'web-x86',[],[{'source':'private/image@sha256:abc'}],[])
        with patch.object(image_state,'receipt',return_value=receipt),patch.object(publish,'Release') as remote:
            restored=publish.restore_target(c,'web-x86',Path('unused'),[])
        self.assertEqual(restored,receipt)
        remote.assert_not_called()

    def test_image_version_cannot_be_reassigned_to_another_source(self):
        c=context(push_images=True)
        with patch.object(image_state,'get',return_value={'version':'1.5.0','source_sha':'b'*40}), \
                patch.object(image_state,'api') as api:
            with self.assertRaisesRegex(ValueError,'state conflict'):
                image_state.reserve(c)
        api.assert_not_called()


if __name__=='__main__':unittest.main()
