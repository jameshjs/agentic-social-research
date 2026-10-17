#!/usr/bin/env bash
# Deploy a tested commit through the restricted ci-deploy account (ops/ci-deploy/README.md).
# This side only builds one allowlisted release tarball and streams it over SSH. The VM's root-owned
# counterfactual-activate validates it, swaps the release, smoke-tests both paired runs and the public
# site, and restores the previous release on failure. The VM keeps its secrets, systemd unit and Caddy.
#
#   ops/deploy-ci.sh                 deploy HEAD (GitHub Actions, or a human holding the CI key)
#   ops/deploy-ci.sh --bundle FILE   only build the release tarball (used by the tests)
#
# Env: DEPLOY_SSH_KEY (required to deploy; the CI key, never the root key), DEPLOY_HOST (155.138.141.130),
# DEPLOY_PUBLIC_URL (https://twotwosmyworld.select).
set -euo pipefail
cd "$(dirname "$0")/.."
source ops/deploy-paths.sh

build_bundle() {
  # Same allowlist and excludes as ops/deploy.sh. Paths are stored relative ("api/...").
  COPYFILE_DISABLE=1 tar --no-xattrs -czf "$1" \
    --exclude '.env*' --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store' \
    --exclude 'persona-swarm/data/twin' --exclude 'persona-swarm/data/city/live' \
    "${PATHS[@]#./}"
}

if [ "${1:-}" = --bundle ]; then
  [ -n "${2:-}" ] || { echo 'usage: deploy-ci.sh --bundle FILE' >&2; exit 2; }
  build_bundle "$2"
  exit 0
fi
[ "$#" -eq 0 ] || { echo "Unknown option: $1" >&2; exit 2; }

HOST="${DEPLOY_HOST:-155.138.141.130}"
PUBLIC_URL="${DEPLOY_PUBLIC_URL:-https://twotwosmyworld.select}"
SSH_KEY="${DEPLOY_SSH_KEY:-}"
[[ "$HOST" =~ ^[0-9.]+$ ]] || { echo 'DEPLOY_HOST must be an IPv4 address' >&2; exit 2; }
[[ "$PUBLIC_URL" =~ ^https://[A-Za-z0-9.-]+$ ]] || { echo 'DEPLOY_PUBLIC_URL must be https://<hostname>' >&2; exit 2; }
[ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ] || { echo 'Set DEPLOY_SSH_KEY to the ci-deploy private key file' >&2; exit 2; }

SHA="$(git rev-parse HEAD)"
[ "${GITHUB_SHA:-$SHA}" = "$SHA" ] || { echo 'Checkout does not match workflow commit' >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo 'Refusing to deploy a dirty checkout' >&2; exit 2; }
if [ "${GITHUB_ACTIONS:-}" = true ]; then
  latest="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
  [ -n "$latest" ] || { echo 'Could not verify the current main commit' >&2; exit 2; }
  if [ "$latest" != "$SHA" ]; then
    echo "Skipping superseded deploy: main is $latest, this job is $SHA"
    exit 0
  fi
fi

bundle="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/two-worlds-release.XXXXXX")"
trap 'rm -f "$bundle"' EXIT
build_bundle "$bundle"
echo "Release $SHA: $(( $(wc -c < "$bundle") / 1024 )) KiB"

# ci-deploy has no shell: the VM's forced command accepts only "deploy <sha>" and "status".
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile=ops/known_hosts \
  "ci-deploy@$HOST" "deploy $SHA" < "$bundle"

# Check from outside the VM as well.
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 15 "$PUBLIC_URL/api/health" | grep -q "\"git_sha\":\"$SHA\""; then
    curl -fsS -o /dev/null --max-time 15 "$PUBLIC_URL/experience/"
    echo "Verified $PUBLIC_URL/api/health reports $SHA"
    exit 0
  fi
  sleep 3
done
echo "Public health check did not report $SHA" >&2
exit 1
