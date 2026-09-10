"""Exercise normal merges, idempotence and conflicts against disposable Git repositories."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import source
from model import read_json


class Mirrors(unittest.TestCase):
    def exercise(self, conflict=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'source'
            root.mkdir()
            def git(*args, cwd=root):
                return subprocess.check_output(['git', *args], cwd=cwd, stderr=subprocess.PIPE, text=True).strip()
            git('init', '-b', 'master')
            git('config', 'user.name', 'CI Test')
            git('config', 'user.email', 'test@example.invalid')
            (root / 'README.md').write_text('base\n')
            git('add', '.')
            git('commit', '-m', 'base')
            github, gitee = (Path(tmp) / name for name in ('github.git', 'gitee.git'))
            git('clone', '--bare', str(root), str(github))
            git('clone', '--bare', str(root), str(gitee))
            git('checkout', '-b', 'mirror')
            (root / 'README.md').write_text('mirror introduction\n')
            git('commit', '-am', 'mirror description')
            git('push', str(github), 'HEAD:master')
            before = git('rev-parse', 'HEAD')
            git('checkout', 'master')
            (root / ('README.md' if conflict else 'build.txt')).write_text('primary changes\n')
            git('add', '.')
            git('commit', '-m', 'primary changes')
            sha = git('rev-parse', 'HEAD')
            output = root / '.release'
            mapping = {'https://github.com/owner/repo.git': str(github), 'https://gitee.com/owner/repo.git': str(gitee)}
            def mapped_git(args, token, cwd=None):
                return git(*(mapping.get(str(arg), str(arg)) for arg in args), cwd=cwd or root)
            with patch.object(source, 'OUT', output), patch.object(source, 'git', side_effect=mapped_git), \
                    patch.object(source, 'run', side_effect=lambda args: git(*args[1:])), \
                    patch.dict(os.environ, {'GITHUB_REPO':'owner/repo', 'GH_TOKEN':'fixture',
                                            'GITEE_URL':'https://gitee.com/owner/repo.git', 'GITEE_TOKEN':'fixture'}):
                context = {'source_sha':sha, 'sync_repos':True}
                if conflict:
                    with self.assertRaises(subprocess.CalledProcessError):
                        source.synchronize_repositories(context)
                    self.assertEqual(git('rev-parse', 'master', cwd=github), before)
                    self.assertEqual(read_json(output / 'repository-sync.json')['status'], 'failed')
                else:
                    source.synchronize_repositories(context)
                    report = read_json(output / 'repository-sync.json')
                    self.assertEqual(report['status'], 'success')
                    self.assertEqual(git('show', 'master:README.md', cwd=github), 'mirror introduction')
                    self.assertEqual(git('rev-parse', 'master', cwd=gitee), sha)
                    source.synchronize_repositories(context)
                    again = read_json(output / 'repository-sync.json')
                    self.assertTrue(all(m['before'] == m['after'] for m in again['mirrors']))
                self.assertEqual(git('rev-parse', 'HEAD'), sha)
                self.assertEqual(git('worktree', 'list', '--porcelain').count('worktree '), 1)

    def test_mirrors_merge_and_repeat_without_changing_primary(self):
        self.exercise()

    def test_conflict_preserves_remote_and_removes_only_temporary_worktree(self):
        self.exercise(conflict=True)
