#!/usr/bin/env python3
"""Validate and unpack one CI release tarball for the Two Worlds VM.

Installed root-owned at /usr/local/lib/counterfactual-ci/release-check.py and run by
counterfactual-activate as root. The tarball comes from the restricted ci-deploy account,
so everything in it is untrusted:

  release-check.py check   RELEASE.tar.gz         validate only (used by the repo tests)
  release-check.py extract RELEASE.tar.gz DEST    validate, then unpack into the empty DEST

A release may contain only regular files and directories under the same allowlist as
ops/deploy-paths.sh. Links, devices, absolute or `..` paths, `.git`, `node_modules`
and any `.env*` name are refused. When deploy-paths.sh changes, update ALLOW_* here
and reinstall this file on the VM as root (see ops/ci-deploy/README.md).
"""
import os
import posixpath
import sys
import tarfile

ALLOW_DIRS = (
    'api', 'experiment', 'world', 'data', 'experience', 'demo-ui', 'pitch',
    'persona-swarm/data/record', 'persona-swarm/data/reactions',
)
ALLOW_FILES = {
    'persona-swarm/runtime/agents-client.js',
    'bloor-bike-demo.md', 'bike-lane-papers.md', 'papers.md', 'demo-data.md', 'prd.md',
}
PARENT_DIRS = {'persona-swarm', 'persona-swarm/data', 'persona-swarm/runtime'}
REQUIRED = ('api/server.js', 'experience/index.html')
MAX_MEMBERS = 20000
MAX_BYTES = 300 * 1024 * 1024


class Refused(Exception):
    pass


def clean_name(raw):
    name = raw[2:] if raw.startswith('./') else raw
    name = name.rstrip('/')
    if name in ('', '.'):
        return None
    if name.startswith('/') or '\\' in name or '\x00' in name:
        raise Refused(f'unsafe path: {raw!r}')
    if posixpath.normpath(name) != name:
        raise Refused(f'non-canonical path: {raw!r}')
    for part in name.split('/'):
        if part in ('..', '.git', 'node_modules') or part.startswith('.env'):
            raise Refused(f'forbidden path component in {raw!r}')
    return name


def allowed(name, member):
    if name in ALLOW_FILES:
        return member.isfile()
    if name in PARENT_DIRS:
        return member.isdir()
    return any(name == d or name.startswith(d + '/') for d in ALLOW_DIRS)


def validate(path):
    """Return [(member, clean_name)] for an acceptable release, or raise Refused."""
    try:
        archive = tarfile.open(path, 'r:gz')
    except (tarfile.TarError, OSError) as error:
        raise Refused(f'not a gzip tar archive ({error.__class__.__name__})')
    with archive:
        accepted, total, seen = [], 0, set()
        for count, member in enumerate(archive, start=1):
            if count > MAX_MEMBERS:
                raise Refused(f'more than {MAX_MEMBERS} entries')
            name = clean_name(member.name)
            if name is None:
                if not member.isdir():
                    raise Refused('archive root is not a directory')
                continue
            if not (member.isfile() or member.isdir()):
                raise Refused(f'only regular files and directories are allowed: {name}')
            if not allowed(name, member):
                raise Refused(f'path is outside the deploy allowlist: {name}')
            if name in seen:
                raise Refused(f'duplicate entry: {name}')
            seen.add(name)
            total += member.size
            if total > MAX_BYTES:
                raise Refused(f'release is larger than {MAX_BYTES // (1024 * 1024)} MB')
            accepted.append((member, name))
        missing = [r for r in REQUIRED if r not in seen]
        if missing:
            raise Refused('release is missing ' + ', '.join(missing))
        return accepted


def extract(path, dest):
    accepted = validate(path)
    if not os.path.isdir(dest) or os.listdir(dest):
        raise Refused('destination must be an existing empty directory')
    with tarfile.open(path, 'r:gz') as archive:
        by_name = {name: member for member, name in accepted}
        for member in archive:
            name = clean_name(member.name)
            if name is None:
                continue
            original = by_name.get(name)
            if original is None or original.offset != member.offset:
                raise Refused('archive changed between validation and extraction')
            member.name = name
            member.uid = member.gid = 0
            member.uname = member.gname = 'root'
            member.mode = 0o755 if member.isdir() or member.mode & 0o100 else 0o644
            # filter='data' (Python 3.12+) is a second guard against links and path escapes.
            archive.extract(member, dest, set_attrs=True, filter='data')
    return len(accepted)


def main(argv):
    if len(argv) == 3 and argv[1] == 'check':
        print(f'release ok: {len(validate(argv[2]))} entries')
        return 0
    if len(argv) == 4 and argv[1] == 'extract':
        print(f'release unpacked: {extract(argv[2], argv[3])} entries')
        return 0
    print(__doc__.strip().splitlines()[0], file=sys.stderr)
    print('usage: release-check.py check FILE | extract FILE DEST', file=sys.stderr)
    return 2


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv))
    except Refused as refused:
        print(f'release refused: {refused}', file=sys.stderr)
        sys.exit(1)
