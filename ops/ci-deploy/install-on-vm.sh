#!/usr/bin/env bash
# For Meet (root SSH access) after review: copy ops/ci-deploy/ to the VM and run vm-setup.sh as root.
# Nothing in CI runs this. The CI key's private half never passes through here; only the public line.
#
#   ops/ci-deploy/install-on-vm.sh install PUBLIC_KEY_FILE   create or update ci-deploy with that key
#   ops/ci-deploy/install-on-vm.sh check                     show the effective sshd and sudo rules
#   ops/ci-deploy/install-on-vm.sh revoke                    remove the CI key from the VM
#   ops/ci-deploy/install-on-vm.sh uninstall                 remove the account and its rules
#
# Env: DEPLOY_HOST (155.138.141.130), DEPLOY_SSH_KEY (root key, ~/.ssh/vultr_htv_ed25519).
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST="${DEPLOY_HOST:-155.138.141.130}"
ROOT_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/vultr_htv_ed25519}"
[[ "$HOST" =~ ^[0-9.]+$ ]] || { echo 'DEPLOY_HOST must be an IPv4 address' >&2; exit 2; }
action="${1:-}"
args=()
case "$action" in
  install)
    pub="${2:-}"
    [ -f "$pub" ] || { echo 'usage: install-on-vm.sh install PUBLIC_KEY_FILE' >&2; exit 2; }
    grep -q 'PRIVATE KEY' "$pub" && { echo "$pub is a private key; pass the .pub file" >&2; exit 2; }
    line="$(tr -d '\r' < "$pub" | head -n 1)"
    args=("$line") ;;
  check|revoke|uninstall) ;;
  *) sed -n '2,10p' "$0"; exit 2 ;;
esac
quoted=""; for a in "${args[@]+"${args[@]}"}"; do quoted+=" $(printf '%q' "$a")"; done
COPYFILE_DISABLE=1 tar -czf - -C ops/ci-deploy counterfactual-activate counterfactual-ci-receive release-check.py \
    sshd-ci-deploy.conf sudoers-ci-deploy vm-setup.sh \
  | ssh -i "$ROOT_KEY" -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=ops/known_hosts \
      "root@$HOST" "set -e; d=\$(mktemp -d); trap 'rm -rf \"\$d\"' EXIT; tar -xzf - -C \"\$d\"; bash \"\$d/vm-setup.sh\" $action$quoted"
