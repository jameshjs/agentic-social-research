# Restricted CI deploy account: review and approval

**Status: proposed. Nothing in this folder has been installed on the VM, and no GitHub secret exists.** Until Meet runs the steps below, GitHub Actions still runs every test. The deploy job then reports "Deploy skipped" and does not touch the VM. The live site at <https://twotwosmyworld.select/experience/> and the manual root deploy (`ops/deploy.sh`) are unchanged.

## Why

Before this change, the workflow needed `VULTR_DEPLOY_SSH_KEY`: a private key for **`root@155.138.141.130`**. Putting that in GitHub would let anyone who can change a workflow, or who compromises an action or a runner, run any command as root on the VM. That includes reading `/etc/counterfactual.env`, rewriting Caddy, and replacing the systemd unit.

## Design

CI gets a dedicated **`ci-deploy`** account with no shell. Its single key can do exactly two things.

| Request over SSH | What runs | Privilege |
| --- | --- | --- |
| `status` | prints `/srv/counterfactual/VERSION` | `ci-deploy` |
| `deploy <40-hex sha>`, with a release tarball on stdin | `sudo -n /usr/local/sbin/counterfactual-activate <sha>` | root, through **one** sudo rule |

`counterfactual-activate` is root-owned and installed by hand. It is the repo's file, so it can be reviewed, but a CI deploy cannot change it. It does the following:

1. **Reads the upload.** It reads stdin (at most 120 MB) into a root-only temporary directory. There is no shared upload folder, so nothing can be swapped mid-check.
2. **Validates and unpacks.** It uses `release-check.py`, which accepts only regular files and directories under the same allowlist as `ops/deploy-paths.sh`. It refuses:
   - links, devices and FIFOs
   - absolute paths, `..` and non-canonical paths
   - `.git`, `node_modules` and any `.env*` name
   - unknown top-level paths and duplicates
   - more than 20,000 entries or more than 300 MB unpacked

   Files are written root-owned at mode 644/755. It also requires Python 3.12's `tarfile` `data` filter.
3. **Swaps the release.** It writes `VERSION`, sets `root:root u=rwX,go=rX` (the same state `ops/deploy.sh` leaves), and swaps `/srv/counterfactual`.
4. **Checks the new release.** It restarts `counterfactual`, then checks `/api/health` for the SHA, `/experience/`, the fare and bike paired runs, and the public HTTPS health and `/experience/` at `https://twotwosmyworld.select`. If any check fails, it restores the previous release and restarts it. It keeps the five newest `/srv/counterfactual.rollback-*` copies.
5. **Leaves the rest alone.** It never touches `/etc/counterfactual.env`, the systemd unit, Caddy, users or packages. Those changes stay manual, through `ops/deploy.sh` as root.

The runner checks the public `/api/health` again from outside the VM.

### What the CI key cannot do

All of these were checked in the Docker test below.
- It cannot open a shell, run another command, chain extra commands after `deploy <sha>`, or use scp or sftp.
- It cannot request a TTY, use port forwarding, agent forwarding or X11, or tunnel.
- It cannot run any sudo command other than `counterfactual-activate`, with exactly one lowercase 40-hex argument.
- It cannot change its own `authorized_keys`, which are root-owned outside its home.
- It cannot deploy a link, an env file, or a path outside the allowlist, and a release that fails its checks is rolled back.

### Remaining risk (accept or decline)

- **Deployed code can read the inference key.** A deploy publishes new JavaScript that the service runs as user `app`, and `app` can read `/etc/counterfactual.env`, which is `root:app 0640` and holds the Vultr inference key. That is true of any code deploy, manual or CI. The control is who can get a commit onto `main`.
  - **Recommended:** keep branch protection on `main`.
  - **Optional:** add required reviewers on the `production` environment, so each deploy waits for Meet's click.
- **The key can push any release that passes the checks**, for example a site with the wrong content. Rollback covers releases that fail to start, not unwanted content. To undo, revoke the key (below) and redeploy a good commit.

## Exact VM changes (installed by `vm-setup.sh install`)

| Path | Owner, mode | Content |
| --- | --- | --- |
| user `ci-deploy` | system user and group, password `*` (no password login), shell `/bin/bash` (required by `ForceCommand`), home `/var/lib/counterfactual-ci` owned `root:root 0755` | not in groups `app`, `sudo` or `adm` |
| `/etc/ssh/sshd_config.d/60-counterfactual-ci.conf` | `root:root 0644` | [`sshd-ci-deploy.conf`](./sshd-ci-deploy.conf): `Match User ci-deploy` → root-owned `AuthorizedKeysFile`, publickey only, `ForceCommand`, no TTY, no forwarding, tunnel or user rc |
| `/etc/ssh/counterfactual-ci/authorized_keys` | dir `root:root 0755`, file `root:root 0644` | one line: `restrict,command="/usr/local/sbin/counterfactual-ci-receive" ssh-ed25519 AAAA… <comment>` |
| `/usr/local/sbin/counterfactual-ci-receive` | `root:root 0755` | [forced command](./counterfactual-ci-receive) |
| `/usr/local/sbin/counterfactual-activate` | `root:root 0755` | [activation](./counterfactual-activate) |
| `/usr/local/lib/counterfactual-ci/release-check.py` | `root:root 0644` | [release validator](./release-check.py) |
| `/etc/sudoers.d/counterfactual-ci` | `root:root 0440`, checked with `visudo -cf` first | [`sudoers-ci-deploy`](./sudoers-ci-deploy): `ci-deploy ALL=(root) NOPASSWD: /usr/local/sbin/counterfactual-activate ^[0-9a-f]{40}$`, plus `!use_pty`, `env_reset`, `secure_path` |
| `ssh` service | reloaded | Before reloading, the installer runs `sshd -t` and checks that `ci-deploy` has the forced command and root still has `forcecommand none`. Otherwise it removes the drop-in and stops. |

**Unchanged:**
- root login, `root`'s authorized keys and Meet's key
- `PermitRootLogin`
- `/etc/counterfactual.env`
- `counterfactual.service`, Caddy and `/etc/caddy/agents.env`
- the firewall, packages and `app`

Requirements on the VM: Ubuntu 24.04's sudo 1.9.15 (regex arguments need 1.9.10 or later), Python 3.12 and `flock`. The installer checks all three.

## Approval steps for Meet

Run all of these from the repo root on Meet's laptop, which holds the existing root key. The private CI key is created in a temporary folder, goes straight into GitHub, and is then deleted. It never enters git, chat, logs or a command line argument.

```bash
# 0. Optional: rerun the end-to-end check in Docker (no VM access, about 3 minutes).
ops/ci-deploy/e2e-docker.sh

# 1. Create a new key used only by CI. Do not reuse ~/.ssh/vultr_htv_ed25519.
d="$(mktemp -d)"; ssh-keygen -t ed25519 -N '' -C 'two-worlds github-actions ci-deploy' -f "$d/ci_deploy_key"

# 2. Install the account with the PUBLIC half (uses Meet's root key over SSH, pinned host key).
ops/ci-deploy/install-on-vm.sh install "$d/ci_deploy_key.pub"
ops/ci-deploy/install-on-vm.sh check

# 3. Limit the production environment to main, then store the PRIVATE half as its secret.
R=jameshjs/agentic-social-research
gh api -X PUT "repos/$R/environments/production" --input - <<<'{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
gh api -X POST "repos/$R/environments/production/deployment-branch-policies" -f name=main -f type=branch
gh secret set VULTR_CI_DEPLOY_KEY --env production --repo "$R" < "$d/ci_deploy_key"
rm -rf "$d"

# 4. Deploy current main and confirm.
gh workflow run deploy.yml --ref main --repo "$R"
curl -s https://twotwosmyworld.select/api/health   # git_sha must equal the main commit
```

**GitHub secret needed**

| Field | Value |
| --- | --- |
| Name | `VULTR_CI_DEPLOY_KEY` |
| Scope | environment secret on the `production` environment, not a repository secret, so only the deploy job on `main` can read it |
| Value | the OpenSSH private key text of the new `ci_deploy_key` |

Do **not** create `VULTR_DEPLOY_SSH_KEY`: the workflow no longer reads it, and it would hold a root key. Optionally, add Meet as a required reviewer on `production` in Settings → Environments.

**Other approvals**
- The commands above need a repository admin.
- `install-on-vm.sh` needs the root key that Meet already uses for `ops/deploy.sh`.

## Revoke or remove

```bash
ops/ci-deploy/install-on-vm.sh revoke      # empty the key list; CI can no longer connect
ops/ci-deploy/install-on-vm.sh uninstall   # remove the user, sshd drop-in, sudo rule and scripts
gh secret delete VULTR_CI_DEPLOY_KEY --env production --repo jameshjs/agentic-social-research
```

To rotate the key, repeat steps 1–3. `install` replaces the key list with the new key.

## Maintenance

- **Keep the allowlists in step.** `ops/deploy-paths.sh` and `ALLOW_*` in `release-check.py` must match. The test job builds the real CI bundle and validates it, so a mismatch fails CI before any deploy.
- **Editing VM files.** After you edit `counterfactual-activate`, `counterfactual-ci-receive`, `release-check.py`, the sshd drop-in or the sudoers file, rerun `install-on-vm.sh install <pub>` as root. CI cannot update them.
- **Manual deploys still work.** `ops/deploy.sh` still deploys as root and still owns the unit, Caddy and the inference key. Do not run it while a CI deploy is in progress. CI deploys take a lock, but the manual script does not.

## Verification done before proposing this

- **`python3 -m unittest ops/ci-deploy/test_release_check.py`** (also run in the GitHub test job):
  - the real `deploy-ci.sh --bundle` output passes the VM allowlist and unpacks
  - 12 kinds of hostile tarball are refused
  - 14 forced-command misuse strings are refused
  - the sudoers file parses
- **`ops/ci-deploy/e2e-docker.sh`** runs 23 checks against an Ubuntu 24.04 container standing in for the VM. It covers:
  - the installer and its sshd and sudo checks
  - every refusal listed above
  - a symlinked release refused, with the live release untouched
  - a release that won't start, rolled back to the previous one, which serves again
  - a real deploy of the current commit, including both paired-run smoke tests
  - root-owned, read-only files afterwards
  - revocation

  The container copy points `PUBLIC_URL` at itself, because it cannot answer for the real domain.
