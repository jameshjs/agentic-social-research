"""Tests for the CI deploy account's VM-side guards (run: python3 -m unittest ops/ci-deploy/test_release_check.py)."""
import importlib.util
import io
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
spec = importlib.util.spec_from_file_location('release_check', HERE / 'release-check.py')
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)


def make_tar(path, entries):
    """entries: list of (name, kind, payload) with kind file|dir|symlink|hardlink|fifo."""
    with tarfile.open(path, 'w:gz') as archive:
        for name, kind, payload in entries:
            info = tarfile.TarInfo(name)
            data = None
            if kind == 'file':
                data = payload.encode()
                info.size = len(data)
            elif kind == 'dir':
                info.type = tarfile.DIRTYPE
            elif kind == 'symlink':
                info.type, info.linkname = tarfile.SYMTYPE, payload
            elif kind == 'hardlink':
                info.type, info.linkname = tarfile.LNKTYPE, payload
            elif kind == 'fifo':
                info.type = tarfile.FIFOTYPE
            archive.addfile(info, io.BytesIO(data) if data is not None else None)


BASE = [('api', 'dir', ''), ('api/server.js', 'file', '// server'),
        ('experience', 'dir', ''), ('experience/index.html', 'file', '<!doctype html>')]


class ReleaseCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def tar(self, extra):
        path = os.path.join(self.tmp, 'r.tar.gz')
        make_tar(path, BASE + extra)
        return path

    def test_real_ci_bundle_matches_the_vm_allowlist(self):
        bundle = os.path.join(self.tmp, 'ci.tar.gz')
        subprocess.run(['bash', str(ROOT / 'ops/deploy-ci.sh'), '--bundle', bundle], check=True, cwd=ROOT)
        accepted = rc.validate(bundle)
        names = {name for _, name in accepted}
        self.assertIn('api/server.js', names)
        self.assertIn('persona-swarm/runtime/agents-client.js', names)
        self.assertFalse(any('.env' in n or n.startswith('.git') for n in names))
        dest = os.path.join(self.tmp, 'out')
        os.mkdir(dest)
        rc.extract(bundle, dest)
        self.assertTrue(os.path.isfile(os.path.join(dest, 'experience/index.html')))

    def test_minimal_release_unpacks_without_modes_from_the_archive(self):
        dest = os.path.join(self.tmp, 'out')
        os.mkdir(dest)
        self.assertEqual(rc.extract(self.tar([('pitch/x.md', 'file', 'hi')]), dest), 5)
        self.assertEqual(oct(os.stat(os.path.join(dest, 'pitch/x.md')).st_mode & 0o777), '0o644')

    def test_refuses_unsafe_entries(self):
        cases = {
            'symlink': [('api/key', 'symlink', '/etc/counterfactual.env')],
            'hardlink': [('api/key', 'hardlink', 'api/server.js')],
            'fifo': [('api/pipe', 'fifo', '')],
            'parent path': [('api/../../etc/passwd', 'file', 'x')],
            'absolute path': [('/etc/cron.d/x', 'file', 'x')],
            'env file': [('api/.env', 'file', 'KEY=1')],
            'env-like name': [('data/.env.production', 'file', 'KEY=1')],
            'git dir': [('experience/.git/config', 'file', 'x')],
            'outside allowlist': [('ops/deploy.sh', 'file', 'x')],
            'persona-swarm other data': [('persona-swarm/data/twin/a.json', 'file', '{}')],
            'duplicate': [('api/server.js', 'file', 'again')],
            'non-canonical': [('api//server2.js', 'file', 'x')],
        }
        for label, extra in cases.items():
            with self.subTest(label):
                with self.assertRaises(rc.Refused):
                    rc.validate(self.tar(extra))

    def test_refuses_missing_server_and_non_tar(self):
        path = os.path.join(self.tmp, 'r.tar.gz')
        make_tar(path, [('api', 'dir', ''), ('api/x.js', 'file', '')])
        with self.assertRaises(rc.Refused):
            rc.validate(path)
        pathlib.Path(path).write_bytes(b'not a tarball')
        with self.assertRaises(rc.Refused):
            rc.validate(path)

    def test_extract_needs_an_empty_destination(self):
        dest = os.path.join(self.tmp, 'out')
        os.mkdir(dest)
        pathlib.Path(dest, 'old').write_text('x')
        with self.assertRaises(rc.Refused):
            rc.extract(self.tar([]), dest)


class ForcedCommand(unittest.TestCase):
    def run_request(self, request):
        env = {'PATH': os.environ['PATH'], 'SSH_CLIENT': '192.0.2.1 5000 22'}
        if request is not None:
            env['SSH_ORIGINAL_COMMAND'] = request
        return subprocess.run(['bash', str(HERE / 'counterfactual-ci-receive')], env=env,
                              capture_output=True, text=True, stdin=subprocess.DEVNULL)

    def test_refuses_everything_but_deploy_sha_and_status(self):
        for request in [None, '', 'bash', 'ls /', 'scp -t /srv', 'internal-sftp', 'deploy', 'deploy abc',
                        'deploy ' + 'A' * 40, 'deploy ' + 'a' * 39, 'deploy ' + 'a' * 41,
                        'deploy ' + 'a' * 40 + '; id', 'deploy $(id)', 'status; id']:
            with self.subTest(request=request):
                result = self.run_request(request)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIn('ci-deploy:', result.stderr)


@unittest.skipUnless(shutil.which('visudo'), 'visudo not installed')
class SudoRule(unittest.TestCase):
    def test_sudoers_rule_parses(self):
        result = subprocess.run(['visudo', '-cf', str(HERE / 'sudoers-ci-deploy')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    sys.exit(unittest.main())
