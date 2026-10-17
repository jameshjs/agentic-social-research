#!/usr/bin/env bash
# Deploy a tested commit to the existing Vultr VM. The VM keeps its secrets and Caddy setup.
# A failed health/smoke check restores the prior release and restarts the service.
set -euo pipefail
cd "$(dirname "$0")/.."
source ops/deploy-paths.sh

HOST="${DEPLOY_HOST:-155.138.141.130}"
DOMAIN="${DEPLOY_DOMAIN:-${HOST//./-}.sslip.io}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/vultr_htv_ed25519}"
[[ "$HOST" =~ ^[0-9.]+$ ]] || { echo 'DEPLOY_HOST must be an IPv4 address' >&2; exit 2; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo 'DEPLOY_DOMAIN has unexpected characters' >&2; exit 2; }
[ -f "$SSH_KEY" ] || { echo "SSH key not found: $SSH_KEY" >&2; exit 2; }
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

SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15)
ssh_root() { ssh "${SSH_OPTS[@]}" "root@$HOST" "$@"; }
STAGE="/srv/counterfactual.stage-${SHA:0:12}-$(date -u +%Y%m%d%H%M%S)-$$"
echo "Staging $SHA on $HOST"
ssh_root "mkdir -m 0755 '$STAGE'"
rsync -azR \
  --exclude '.env*' --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store' \
  --exclude 'persona-swarm/data/twin' --exclude 'persona-swarm/data/city/live' \
  -e "ssh ${SSH_OPTS[*]}" "${PATHS[@]}" "root@$HOST:$STAGE/"
printf '{"git_sha":"%s","dirty":false,"deployed_at":"%s"}\n' "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  | ssh_root "cat > '$STAGE/VERSION'"

ssh_root "bash -s -- '$STAGE' '$SHA' '$DOMAIN'" <<'REMOTE'
set -euo pipefail
stage="$1"; sha="$2"; domain="$3"
current=/srv/counterfactual
backup="/srv/counterfactual.rollback-$(date -u +%Y%m%d%H%M%S)-$$"
test -f /etc/counterfactual.env
test -d "$current"
chown -R root:root "$stage"
chmod -R u=rwX,go=rX "$stage"
if find "$stage" -name '.env*' -print -quit | grep -q .; then
  echo 'Staged release contains an environment file' >&2
  exit 1
fi

rollback() {
  echo "Deploy failed; restoring previous release $backup" >&2
  if [ -d "$backup" ]; then
    [ ! -d "$current" ] || mv "$current" "${stage}.failed"
    mv "$backup" "$current"
    systemctl restart counterfactual || true
  fi
}
trap rollback ERR
mv "$current" "$backup"
mv "$stage" "$current"
systemctl restart counterfactual
ready=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:8080/api/health \
    | grep -q "\"git_sha\":\"$sha\""; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || { echo 'New service did not report the deployed SHA' >&2; false; }
curl -fsS -o /dev/null --max-time 10 http://127.0.0.1:8080/experience/
for scenario in fare bike; do
  curl -fsS --max-time 60 -H 'Content-Type: application/json' \
    -d "{\"scenario\":\"$scenario\",\"seed\":42}" \
    http://127.0.0.1:8080/api/run \
    | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{let x=JSON.parse(s);if(x.result?.schema_version!=="experiment.v2"||!x.result?.runs?.baseline||!x.result?.runs?.intervention)process.exit(1)})'
  echo "Smoke test passed: $scenario paired run"
done
curl -fsS --max-time 15 "https://$domain/api/health" \
  | grep -q "\"git_sha\":\"$sha\""
curl -fsS -o /dev/null --max-time 15 "https://$domain/experience/"
trap - ERR
echo "Deployed $sha to https://$domain/experience/ (previous release: $backup)"
REMOTE
