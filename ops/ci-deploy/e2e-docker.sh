#!/usr/bin/env bash
# End-to-end check of the ci-deploy account in a throwaway Ubuntu 24.04 container (needs Docker).
# Nothing here touches the real VM. The container stands in for it: sshd, sudo, python3 3.12, Node 22,
# an `app` user and a seeded /srv/counterfactual. `systemctl` is a stub that restarts node api/server.js.
# The installed counterfactual-activate is the repo file with PUBLIC_URL pointed at the container itself,
# because the container cannot answer for twotwosmyworld.select.
#
#   ops/ci-deploy/e2e-docker.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
work="$(mktemp -d "${TMPDIR:-/tmp}/ci-deploy-e2e.XXXXXX")"
name="ci-deploy-e2e-$$"
port="${E2E_SSH_PORT:-22022}"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
pass=0; fail=0
ok() { echo "PASS  $*"; pass=$((pass + 1)); }
bad() { echo "FAIL  $*"; fail=$((fail + 1)); }
expect() { local label="$1"; shift; if "$@" >"$work/out" 2>&1; then ok "$label"; else bad "$label"; sed 's/^/      /' "$work/out" | tail -n 8; fi; }
expect_refused() { local label="$1"; shift; if "$@" >"$work/out" 2>&1; then bad "$label (was allowed)"; sed 's/^/      /' "$work/out" | tail -n 5; else ok "$label"; fi; }

cat > "$work/Dockerfile" <<'DOCKER'
FROM node:22-bookworm-slim AS node
FROM ubuntu:24.04
RUN apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends \
      openssh-server sudo python3 curl ca-certificates procps && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/bin/node
RUN useradd -m -s /usr/sbin/nologin app && mkdir -p /run/sshd /srv/counterfactual && ssh-keygen -A \
 && install -m 0640 -o root -g app /dev/null /etc/counterfactual.env
COPY systemctl /usr/bin/systemctl
CMD ["/usr/sbin/sshd", "-D", "-e"]
DOCKER
cat > "$work/systemctl" <<'STUB'
#!/bin/sh
# Test stub for the two systemctl calls the CI path makes.
case "$1 $2" in
  "restart counterfactual")
    pkill -f 'node api/server.js' || true; sleep 1
    cd /srv/counterfactual && su -s /bin/sh app -c 'nohup /usr/bin/node api/server.js --port 8080 --host 127.0.0.1 >/tmp/server.log 2>&1 &' ;;
  "reload ssh"|"reload sshd") pkill -HUP -x sshd || true ;;
esac
exit 0
STUB
chmod 755 "$work/systemctl"
echo "Building test VM image…"
docker build -q -t ci-deploy-e2e "$work" >/dev/null
docker run -d --name "$name" -p "127.0.0.1:$port:22" ci-deploy-e2e >/dev/null
vm() { docker exec -i "$name" bash -c "$1"; }

# Seed the "previous release" the way ops/deploy.sh leaves it.
bash ops/deploy-ci.sh --bundle "$work/release.tar.gz"
docker cp "$work/release.tar.gz" "$name:/root/seed.tar.gz"
vm 'tar -xzf /root/seed.tar.gz -C /srv/counterfactual && echo "{\"git_sha\":\"seed\"}" > /srv/counterfactual/VERSION && chown -R root:root /srv/counterfactual && chmod -R u=rwX,go=rX /srv/counterfactual && systemctl restart counterfactual'

# Install exactly as Meet would, from a copy of ops/ci-deploy/, with a throwaway key.
ssh-keygen -q -t ed25519 -N '' -C 'e2e-ci-deploy' -f "$work/ci_key"
docker cp ops/ci-deploy "$name:/root/ci-deploy"
vm "sed -i 's#^PUBLIC_URL=.*#PUBLIC_URL=http://127.0.0.1:8080#' /root/ci-deploy/counterfactual-activate"
expect 'vm-setup.sh install validates sshd and sudoers and installs the account' \
  vm "bash /root/ci-deploy/vm-setup.sh install '$(cat "$work/ci_key.pub")'"
vm 'bash /root/ci-deploy/vm-setup.sh check' | sed 's/^/      /'
expect 'root sshd settings unchanged (forcecommand none)' vm "sshd -T -C user=root,host=x,addr=192.0.2.1 | grep -qi '^forcecommand none$'"

docker exec "$name" bash -c 'ssh-keyscan -p 22 127.0.0.1 2>/dev/null' | sed "s/^127.0.0.1/[127.0.0.1]:$port/" > "$work/known_hosts"
S=(ssh -p "$port" -i "$work/ci_key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$work/known_hosts" ci-deploy@127.0.0.1)

# Wait for the seeded server's warm-up.
for i in $(seq 1 40); do vm 'curl -fsS http://127.0.0.1:8080/api/health' >/dev/null 2>&1 && break; sleep 2; done

expect 'status prints the deployed VERSION' bash -c "$(printf '%q ' "${S[@]}") status | grep -q seed"
expect_refused 'arbitrary command is refused' "${S[@]}" 'id'
expect_refused 'interactive shell is refused' "${S[@]}" -tt
expect_refused 'command injection after a sha is refused' "${S[@]}" "deploy $(printf 'a%.0s' {1..40}); id"
expect_refused 'scp upload is refused' scp -P "$port" -i "$work/ci_key" -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile="$work/known_hosts" "$work/ci_key.pub" ci-deploy@127.0.0.1:/tmp/x
expect_refused 'sftp is refused' bash -c "echo ls | sftp -P $port -i '$work/ci_key' -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile='$work/known_hosts' ci-deploy@127.0.0.1"
# A -L listener always opens on the client; the server must refuse the channel when it is used.
forward() { "${S[@]}" -N -L 18080:127.0.0.1:8080 & local p=$!; sleep 3; local r=1; curl -fsS --max-time 5 http://127.0.0.1:18080/api/health >/dev/null 2>&1 && r=0; kill "$p" 2>/dev/null; wait "$p" 2>/dev/null; return $r; }
expect_refused 'local port forwarding is refused' forward
expect_refused 'sudo: a shell is refused for ci-deploy' vm "su -s /bin/bash ci-deploy -c 'sudo -n /bin/sh -c id'"
expect_refused 'sudo: activate with a non-sha argument is refused' vm "su -s /bin/bash ci-deploy -c 'sudo -n /usr/local/sbin/counterfactual-activate --help'"
expect_refused 'sudo: activate with two arguments is refused' vm "su -s /bin/bash ci-deploy -c 'sudo -n /usr/local/sbin/counterfactual-activate $(printf 'a%.0s' {1..40}) x'"
expect_refused 'ci-deploy cannot edit its authorized_keys' vm "su -s /bin/bash ci-deploy -c 'echo x >> /etc/ssh/counterfactual-ci/authorized_keys'"

# A hostile release: a link to the env file. Must be refused and leave the live release alone.
python3 - "$work/evil.tar.gz" <<'PY'
import io, sys, tarfile
with tarfile.open(sys.argv[1], 'w:gz') as t:
    for name, data in [('api/server.js', b'//'), ('experience/index.html', b'x')]:
        i = tarfile.TarInfo(name); i.size = len(data); t.addfile(i, io.BytesIO(data))
    i = tarfile.TarInfo('data/key'); i.type = tarfile.SYMTYPE; i.linkname = '/etc/counterfactual.env'; t.addfile(i)
PY
expect_refused 'release with a symlink is refused' "${S[@]}" "deploy $(printf 'b%.0s' {1..40})" < "$work/evil.tar.gz"
expect 'live release untouched after the refused upload' vm 'grep -q seed /srv/counterfactual/VERSION'

# A release that passes validation but cannot start: the activation must roll back.
mkdir -p "$work/broken"; tar -xzf "$work/release.tar.gz" -C "$work/broken"
echo 'process.exit(1)' > "$work/broken/api/server.js"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$work/broken.tar.gz" -C "$work/broken" .
expect_refused 'release that fails its health check is rejected' "${S[@]}" "deploy $(printf 'c%.0s' {1..40})" < "$work/broken.tar.gz"
for i in $(seq 1 40); do vm 'curl -fsS http://127.0.0.1:8080/api/health' >/dev/null 2>&1 && break; sleep 2; done
expect 'rollback restored the previous release and it serves again' vm 'grep -q seed /srv/counterfactual/VERSION && curl -fsS http://127.0.0.1:8080/api/health >/dev/null'

# The real path: this commit's release through the forced command.
sha="$(git rev-parse HEAD)"
expect "deploy $sha: unpack, swap, health, both paired-run smoke tests" "${S[@]}" "deploy $sha" < "$work/release.tar.gz"
expect 'service reports the deployed sha' vm "curl -fsS http://127.0.0.1:8080/api/health | grep -q '\"git_sha\":\"$sha\"'"
expect 'release is root-owned and read-only for others' vm "[ \"\$(stat -c %U:%G /srv/counterfactual/api/server.js)\" = root:root ] && [ -z \"\$(find /srv/counterfactual -perm /022 -print -quit)\" ]"
expect 'env file and systemd stub untouched' vm '[ "$(stat -c %U:%G:%a /etc/counterfactual.env)" = root:app:640 ]'

expect 'revoke removes the key' vm 'bash /root/ci-deploy/vm-setup.sh revoke'
expect_refused 'revoked key can no longer connect' "${S[@]}" status

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
