"""Real Git checks for version preparation, failed retries and safe source writeback."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import model
import publish
import release
import source
import versioning


class VersionCommits(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'source'
        self.root.mkdir()
        self.remote = Path(self.temp.name) / 'remote.git'
        self.out = self.root / '.release'
        self.git('init', '-b', 'master')
        self.git('config', 'core.autocrlf', 'false')
        self.git('config', 'user.name', 'Version Test')
        self.git('config', 'user.email', 'test@example.invalid')
        model.write_json(self.root / versioning.PACKAGE, {'name':'fixture', 'version':'1.5.0', 'scripts':{'test':'test'}})
        (self.root / '.gitignore').write_text('.release/\n')
        self.git('add', '.')
        self.git('commit', '-m', 'base')
        self.base = self.git('rev-parse', 'HEAD')
        self.git('clone', '--bare', str(self.root), str(self.remote))
        def mapped(args, token, cwd=None):
            return self.git(*(str(self.remote) if a == 'https://fixture.invalid/repo.git' else str(a) for a in args), cwd=cwd)
        def run(args, capture=False, extra_env=None):
            return subprocess.check_output(args, cwd=self.root, env={**os.environ, **(extra_env or {})}, text=True).strip()
        for patcher in [patch.object(source, 'git', side_effect=mapped), patch.object(versioning, 'ROOT', self.root),
                        patch.object(versioning, 'OUT', self.out), patch.object(versioning, 'run', side_effect=run),
                        patch.dict(os.environ, {'GITEA_TOKEN':'fixture', 'GITEA_SOURCE_URL':'https://fixture.invalid/repo.git',
                                                'JOB_NAME':'test', 'BUILD_NUMBER':'1'})]:
            patcher.start()
            self.addCleanup(patcher.stop)

    def git(self, *args, cwd=None):
        return subprocess.check_output(['git', *args], cwd=cwd or self.root, stderr=subprocess.PIPE, text=True).strip()

    def prepare(self):
        self.git('checkout', '--detach', self.base)
        c={'version':'1.5.1', 'source_sha':self.base, 'jenkins_build':{'job':'test','number':'1'}}
        versioning.prepare(c)
        return c

    def remote_package(self):
        return json.loads(self.git('show', 'master:' + versioning.PACKAGE, cwd=self.remote))

    def test_failure_keeps_master_unchanged_and_retry_has_identical_build_sha(self):
        first=self.prepare()
        self.assertEqual(self.remote_package()['version'], '1.5.0')
        self.assertEqual(versioning.metadata(first['source_sha'])['version'], '1.5.1')
        versioning.cleanup(first)
        self.assertEqual(self.git('ls-remote', str(self.remote), first['version_ref']), '')
        again=self.prepare()
        self.assertEqual(again['source_sha'], first['source_sha'])
        self.assertNotEqual(again['version_ref'], first['version_ref'])
        versioning.cleanup(again)

    def test_success_fast_forwards_version_and_removes_temporary_source(self):
        c=self.prepare()
        result=versioning.writeback(c)
        self.assertEqual(result['master_sha'], c['source_sha'])
        self.assertEqual(self.remote_package()['version'], '1.5.1')
        versioning.cleanup(c)
        self.assertEqual(self.git('ls-remote', str(self.remote), c['version_ref']), '')
        self.assertEqual(self.git('rev-parse', 'HEAD'), c['source_sha'])

    def concurrent_change(self, c, newer=False):
        self.git('checkout', '--detach', self.base)
        package=model.read_json(self.root / versioning.PACKAGE)
        package['scripts']['new-command']='preserve this'
        if newer:package['version']='1.5.9'
        model.write_json(self.root / versioning.PACKAGE, package)
        (self.root / 'user-change.txt').write_text('concurrent user change\n')
        self.git('add', '.')
        self.git('commit', '-m', 'concurrent change')
        self.git('push', str(self.remote), 'HEAD:master')
        self.git('checkout', '--detach', c['source_sha'])

    def test_writeback_keeps_concurrent_code_and_package_edits(self):
        c=self.prepare()
        self.concurrent_change(c)
        report=versioning.writeback(c)
        package=self.remote_package()
        self.assertEqual(package['version'], '1.5.1')
        self.assertEqual(package['scripts']['new-command'], 'preserve this')
        self.assertEqual(self.git('show', 'master:user-change.txt', cwd=self.remote), 'concurrent user change')
        self.assertTrue(versioning.ancestor(c['source_sha'], report['master_sha']))
        versioning.cleanup(c)

    def test_older_finishing_build_does_not_roll_back_a_newer_version(self):
        c=self.prepare()
        self.concurrent_change(c, newer=True)
        report=versioning.writeback(c)
        self.assertEqual(report['source_version'], '1.5.9')
        self.assertTrue(versioning.ancestor(c['source_sha'], report['master_sha']))
        versioning.cleanup(c)

    def test_children_do_not_remove_the_coordinator_source_ref(self):
        c=self.prepare()
        with patch.dict(os.environ, {'JOB_NAME':'child'}):versioning.cleanup(c)
        self.assertTrue(self.git('ls-remote', str(self.remote), c['version_ref']))
        versioning.cleanup(c)

    def test_same_version_needs_no_new_commit_and_older_version_is_rejected(self):
        c={'version':'1.5.0', 'source_sha':self.base}
        versioning.prepare(c)
        self.assertEqual(c['source_sha'], self.base)
        self.assertNotIn('version_ref', c)
        with self.assertRaisesRegex(ValueError, 'older than master'):
            versioning.prepare({'version':'1.4.9', 'source_sha':self.base})

    def test_rewritten_master_history_is_rejected_without_overwriting_it(self):
        c=self.prepare()
        self.git('checkout', '--orphan', 'rewritten')
        self.git('commit', '-m', 'unrelated fixture history')
        rewritten=self.git('rev-parse', 'HEAD')
        self.git('push', '--force', str(self.remote), 'HEAD:master')  # Disposable local bare repository only.
        self.git('checkout', '--detach', c['source_sha'])
        with self.assertRaisesRegex(ValueError, 'history changed'):
            versioning.writeback(c)
        self.assertEqual(self.git('rev-parse', 'master', cwd=self.remote), rewritten)
        versioning.cleanup(c)


class Completion(unittest.TestCase):
    def test_failed_publication_cannot_write_the_source_version(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'OUT', Path(tmp)), \
                patch.object(versioning, 'writeback') as writeback:
            model.write_json(Path(tmp)/'publication.json', {'status':'failed'})
            with self.assertRaisesRegex(ValueError, 'successful'):
                release.write_version({})
        writeback.assert_not_called()

    def test_writeback_still_runs_when_release_and_mirror_publication_are_disabled(self):
        c={'version':'1.5.1', 'source_sha':'a'*40, 'android_sha':None, 'publish_release':False, 'sync_repos':False}
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'OUT', Path(tmp)), \
                patch.object(versioning, 'writeback', return_value={'status':'success','master_sha':'a'*40}) as writeback, \
                patch.object(source, 'synchronize_repositories') as sync, patch.object(publish, 'Release') as endpoint:
            model.write_json(Path(tmp)/'publication.json', {**c,'status':'success','steps':{}})
            release.write_version(c)
        writeback.assert_called_once_with(c)
        sync.assert_not_called()
        endpoint.assert_not_called()
