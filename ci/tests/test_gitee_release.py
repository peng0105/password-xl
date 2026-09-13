import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'release'))
import gitee_release as mirror
import model


class Destination:
    def __init__(self, content=None, fail_upload=False, lost_response=False):
        self.release={'id':2,'name':'Release 1.5.1','body':'syncing','prerelease':True}
        self.content=content; self.fail_upload=fail_upload; self.lost_response=lost_response
        self.uploads=0; self.finished=False
    def maybe(self,path): return self.release
    def pages(self,path):
        return [] if self.content is None else [{'id':3,'name':'app.exe','size':len(self.content)}]
    def request(self,method,path,data=None,headers=None,binary=False):
        if method=='POST':
            self.uploads+=1
            if self.fail_upload:raise ConnectionError('upload failed')
            self.content=data.split(b'\r\n\r\n',1)[1].rsplit(b'\r\n--',1)[0]
            if self.lost_response:raise ConnectionError('lost reply')
            return {'id':3}
        if binary:return self.content
        if method=='PATCH':self.release.update(data); self.finished=True
        return self.release


class GiteeMirror(unittest.TestCase):
    def run_mirror(self,destination,size=3,digest=None,extra_assets=None):
        raw=b'app'; sha=hashlib.sha256(raw).hexdigest()
        asset={'id':4,'name':'app.exe','size':size,'digest':'sha256:'+(digest or sha),
               'browser_download_url':'https://github.com/example/repo/releases/download/1.5.1/app.exe'}
        github=Mock()
        github.pages.return_value=[asset] + (extra_assets or [])
        github.request.side_effect=lambda method,path,**kw: raw if kw.get('binary') else {
            'id':1,'tag_name':'1.5.1','name':'Release 1.5.1','body':'Notes','draft':False,'prerelease':False}
        with patch.dict(os.environ,{'GH_TOKEN':'test','GITHUB_REPO':'example/repo','GITEE_URL':'https://gitee.com/example/repo.git'},clear=True), \
                patch.object(mirror,'Api',return_value=github),patch.object(mirror,'Gitee',return_value=destination), \
                patch.object(mirror,'checked_tag',return_value='a'*40),patch.object(mirror,'sync_tag'):
            return mirror.synchronize('1.5.1','a'*40)

    def setUp(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup)
        self.path=Path(tmp.name)
        p=patch.object(mirror,'OUT',self.path);p.start();self.addCleanup(p.stop)

    def test_new_attachment_is_read_back_before_publishing(self):
        destination=Destination()
        report=self.run_mirror(destination)
        self.assertEqual(report['status'],'success')
        self.assertTrue(destination.finished)
        self.assertFalse(destination.release['prerelease'])
        self.assertEqual(destination.content,b'app')

    def test_identical_attachment_is_reused(self):
        destination=Destination(b'app')
        self.assertTrue(self.run_mirror(destination)['files'][0]['reused'])
        self.assertEqual(destination.uploads,0)

    def test_conflicting_installer_never_overwrites_existing_file(self):
        destination=Destination(b'other')
        with self.assertRaisesRegex(ValueError,'content conflict'):self.run_mirror(destination)
        self.assertEqual(destination.content,b'other')
        self.assertFalse(destination.finished)
        self.assertEqual(model.read_json(self.path/'gitee-release.json')['status'],'failed')

    def test_failed_upload_does_not_publish(self):
        destination=Destination(fail_upload=True)
        with self.assertRaises(ConnectionError):self.run_mirror(destination)
        self.assertFalse(destination.finished)

    def test_lost_upload_reply_recovers_using_list_and_hash(self):
        destination=Destination(lost_response=True)
        self.assertEqual(self.run_mirror(destination)['status'],'success')
        self.assertEqual(destination.uploads,1)

    def test_oversize_installer_uses_authorized_github_link(self):
        destination=Destination()
        report=self.run_mirror(destination,size=mirror.MAX_ATTACHMENT_BYTES+1)
        self.assertEqual(destination.uploads,0)
        self.assertEqual(report['files'][0]['mode'],'github-link')
        self.assertIn('https://github.com/example/repo/releases/download/1.5.1/app.exe',destination.release['body'])
        self.assertIn(hashlib.sha256(b'app').hexdigest(),destination.release['body'])

    def test_source_digest_failure_prevents_upload(self):
        destination=Destination()
        with self.assertRaisesRegex(ValueError,'checksum'):self.run_mirror(destination,digest='0'*64)
        self.assertEqual(destination.uploads,0)

    def test_internal_json_is_not_mirrored(self):
        destination=Destination()
        report=self.run_mirror(destination,extra_assets=[{'name':'release-manifest.json'}])
        self.assertEqual([f['name'] for f in report['files']], ['app.exe'])
        self.assertEqual(destination.uploads,1)
