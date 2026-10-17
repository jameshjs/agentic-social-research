#!/usr/bin/env bash
# Run as root ON THE VM, from a copy of ops/ci-deploy/ (install-on-vm.sh does this over SSH).
# Creates the restricted ci-deploy account described in ops/ci-deploy/README.md. Idempotent.
#
#   vm-setup.sh install 'ssh-ed25519 AAAA... comment'   create or update the account and its one key
#   vm-setup.sh check                                    print the effective sshd and sudo rules
#   vm-setup.sh revoke                                   remove the CI key; the account can no longer log in
#   vm-setup.sh uninstall                                remove the account, key, rules and scripts
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
here="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" = 0 ] || { echo 'run as root' >&2; exit 2; }

USER_NAME=ci-deploy
HOME_DIR=/var/lib/counterfactual-ci
KEY_DIR=/etc/ssh/counterfactual-ci
SSHD_DROPIN=/etc/ssh/sshd_config.d/60-counterfactual-ci.conf
SUDOERS=/etc/sudoers.d/counterfactual-ci
ACTIVATE=/usr/local/sbin/counterfactual-activate
RECEIVE=/usr/local/sbin/counterfactual-ci-receive
LIB_DIR=/usr/local/lib/counterfactual-ci

reload_sshd() { systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true; }
probe() { sshd -T -C "user=$1,host=ci-probe,addr=192.0.2.1" | grep -i "^$2 " || true; }

check() {
  echo "sshd for $USER_NAME:"; probe "$USER_NAME" forcecommand; probe "$USER_NAME" authorizedkeysfile; probe "$USER_NAME" permittty; probe "$USER_NAME" allowtcpforwarding
  echo "sshd for root (must be unchanged):"; probe root forcecommand; probe root authorizedkeysfile
  echo "sudo for $USER_NAME:"; sudo -l -U "$USER_NAME" | sed -n '/may run/,$p'
  echo "keys:"; [ -s "$KEY_DIR/authorized_keys" ] && ssh-keygen -lf "$KEY_DIR/authorized_keys" || echo '  none (CI cannot log in)'
}

case "${1:-}" in
  install)
    key="${2:-}"
    [[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/]{68}(\ [A-Za-z0-9@._-]{1,64})?$ ]] || { echo 'expected one ssh-ed25519 public key line' >&2; exit 2; }
    python3 -c 'import sys; sys.exit(sys.version_info < (3, 12))' || { echo 'python3 3.12+ is required (tarfile data filter)' >&2; exit 1; }
    for tool in flock sshd visudo logger; do command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 1; }; done
    test -d /srv/counterfactual && test -f /etc/counterfactual.env || { echo 'run ops/deploy.sh once first' >&2; exit 1; }

    # 1. Account: system user, no password, root-owned home so it cannot plant dotfiles.
    id "$USER_NAME" >/dev/null 2>&1 || useradd --system --user-group --home-dir "$HOME_DIR" --shell /bin/bash "$USER_NAME"
    usermod -p '*' "$USER_NAME"
    install -d -o root -g root -m 0755 "$HOME_DIR"

    # 2. Root-owned scripts. CI deploys cannot change these; reinstall after editing them in git.
    install -o root -g root -m 0755 "$here/counterfactual-activate" "$ACTIVATE"
    install -o root -g root -m 0755 "$here/counterfactual-ci-receive" "$RECEIVE"
    install -d -o root -g root -m 0755 "$LIB_DIR"
    install -o root -g root -m 0644 "$here/release-check.py" "$LIB_DIR/release-check.py"

    # 3. One sudo rule, validated before it is moved into place.
    tmp="$(mktemp)"; install -m 0440 "$here/sudoers-ci-deploy" "$tmp"
    visudo -cf "$tmp" >/dev/null || { rm -f "$tmp"; echo 'sudoers rule failed validation' >&2; exit 1; }
    install -o root -g root -m 0440 "$tmp" "$SUDOERS"; rm -f "$tmp"

    # 4. One root-owned key, restricted again in the key options in case the sshd drop-in is bypassed.
    install -d -o root -g root -m 0755 "$KEY_DIR"
    printf 'restrict,command="%s" %s\n' "$RECEIVE" "$key" > "$KEY_DIR/authorized_keys.new"
    chmod 0644 "$KEY_DIR/authorized_keys.new"; mv -f "$KEY_DIR/authorized_keys.new" "$KEY_DIR/authorized_keys"

    # 5. sshd drop-in; undone unless ci-deploy is forced and root is unaffected.
    install -o root -g root -m 0644 "$here/sshd-ci-deploy.conf" "$SSHD_DROPIN"
    if ! sshd -t || ! probe "$USER_NAME" forcecommand | grep -q "$RECEIVE" || [ -n "$(probe root forcecommand | grep -v -i ' none$')" ]; then
      rm -f "$SSHD_DROPIN"; echo 'sshd drop-in did not apply as expected; removed it' >&2; exit 1
    fi
    reload_sshd
    check
    echo "Installed. CI may now run only: deploy <sha> (as root via $ACTIVATE) and status."
    ;;
  check) check ;;
  revoke)
    : > "$KEY_DIR/authorized_keys"
    echo 'CI key removed; ci-deploy can no longer log in.'
    ;;
  uninstall)
    rm -f "$SSHD_DROPIN" "$SUDOERS" "$ACTIVATE" "$RECEIVE"
    rm -rf "$KEY_DIR" "$LIB_DIR"
    reload_sshd
    id "$USER_NAME" >/dev/null 2>&1 && userdel "$USER_NAME"
    rm -rf "$HOME_DIR"
    echo 'ci-deploy removed.'
    ;;
  *) sed -n '2,9p' "$0"; exit 2 ;;
esac
