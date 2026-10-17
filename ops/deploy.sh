#!/usr/bin/env bash
# Idempotent deploy of the counterfactual engine (api/server.js) to the Vultr VM.
# Safe to re-run by a human or an agent from the repo root or anywhere else.
#
#   ops/deploy.sh               sync files, refresh the inference key, (re)install the
#                               systemd service and Caddy (HTTPS), then verify from here
#   ops/deploy.sh --skip-key    keep the VM's existing /etc/counterfactual.env
#   ops/deploy.sh --key-only    only refresh /etc/counterfactual.env and restart the service
#   ops/deploy.sh --plain-http  serve plain HTTP on :80 only (no TLS)
#
# Env overrides: DEPLOY_HOST (155.138.141.130), DEPLOY_DOMAIN (<ip-with-dashes>.sslip.io),
# DEPLOY_SSH_KEY (~/.ssh/vultr_htv_ed25519), VULTR_COMPILER_MODEL (glm-5.3-flash).
# The inference key is fetched in memory by ops/vultr.js and streamed over SSH stdin;
# it never appears in argv, logs, this repo or the synced tree.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-155.138.141.130}"
DOMAIN="${DEPLOY_DOMAIN:-${HOST//./-}.sslip.io}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/vultr_htv_ed25519}"
COMPILER_MODEL="${VULTR_COMPILER_MODEL:-glm-5.3-flash}"
REMOTE=/srv/counterfactual
SKIP_KEY=0
KEY_ONLY=0
PLAIN=0
KEY_ATTEMPTS="${DEPLOY_KEY_ATTEMPTS:-6}"
for arg in "$@"; do
  case "$arg" in
    --skip-key) SKIP_KEY=1 ;;
    --key-only) KEY_ONLY=1 ;;
    --plain-http) PLAIN=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

[[ "$HOST" =~ ^[0-9.]+$ ]] || { echo "DEPLOY_HOST must be an IPv4 address" >&2; exit 2; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "DEPLOY_DOMAIN has unexpected characters" >&2; exit 2; }
[[ "$COMPILER_MODEL" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "VULTR_COMPILER_MODEL has unexpected characters" >&2; exit 2; }
[ -f "$SSH_KEY" ] || { echo "SSH key $SSH_KEY not found" >&2; exit 2; }

SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
ssh_root() { ssh "${SSH_OPTS[@]}" "root@$HOST" "$@"; }
step() { printf '\n== %s\n' "$*"; }
WARNINGS=()

# Only these paths are copied; api/server.js additionally allowlists what it serves.
PATHS=(./api ./experiment ./world ./data ./experience ./demo-ui
  ./persona-swarm/data/record ./persona-swarm/runtime/agents-client.js
  ./bloor-bike-demo.md ./bike-lane-papers.md ./papers.md ./demo-data.md ./prd.md)
[ -d persona-swarm/data/reactions ] && PATHS+=(./persona-swarm/data/reactions)

push_key() {
  DEPLOY_HOST="$HOST" DEPLOY_SSH_KEY="$SSH_KEY" DEPLOY_COMPILER_MODEL="$COMPILER_MODEL" node ops/vultr.js run -- node -e '
    "use strict";
    const { spawn } = require("node:child_process");
    const key = process.env.VULTR_INFERENCE_API_KEY || "";
    if (!/^[A-Za-z0-9._-]{8,}$/.test(key)) { console.error("Inference key missing or in an unexpected format; not written."); process.exit(2); }
    const env = { ...process.env };
    delete env.VULTR_INFERENCE_API_KEY;
    delete env.VULTR_API_KEY;
    const remote = "set -e; umask 077; t=$(mktemp /etc/counterfactual.env.XXXXXX); cat > \"$t\"; chown root:app \"$t\"; chmod 0640 \"$t\"; mv -f \"$t\" /etc/counterfactual.env";
    const ssh = spawn("ssh", ["-i", process.env.DEPLOY_SSH_KEY, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", `root@${process.env.DEPLOY_HOST}`, remote], { stdio: ["pipe", "inherit", "inherit"], env });
    ssh.stdin.end(`VULTR_INFERENCE_API_KEY=${key}\nVULTR_COMPILER_MODEL=${process.env.DEPLOY_COMPILER_MODEL}\n`);
    ssh.on("exit", (code) => process.exit(code ?? 1));
  '
}
refresh_key() {
  step "Writing /etc/counterfactual.env (root:app 0640; key streamed over SSH stdin)"
  local pushed=0 attempt
  # The account API checks the caller's IP; a VPN egress that changes per connection can need a retry.
  for attempt in $(seq 1 "$KEY_ATTEMPTS"); do
    if push_key; then pushed=1; break; fi
    echo "  attempt $attempt/$KEY_ATTEMPTS failed; retrying in 5 s" >&2
    sleep 5
  done
  [ "$pushed" = 1 ] || WARNINGS+=("Could not refresh the inference key (Vultr account API unreachable, or this machine's IP is not in Account → API → Access Control). The VM keeps its previous /etc/counterfactual.env.")
  ssh_root 'test -f /etc/counterfactual.env || install -m 0640 -o root -g app /dev/null /etc/counterfactual.env
printf "inference key on VM: %s\n" "$(grep -q "^VULTR_INFERENCE_API_KEY=." /etc/counterfactual.env && echo present || echo absent)"'
}
print_warnings() { for w in "${WARNINGS[@]+"${WARNINGS[@]}"}"; do echo "WARNING: $w" >&2; done; }

if [ "$KEY_ONLY" = 1 ]; then
  refresh_key
  ssh_root 'systemctl restart counterfactual && sleep 2 && curl -fsS http://127.0.0.1:8080/api/health'; echo
  print_warnings
  exit 0
fi

step "Preparing $HOST"
ssh_root 'set -e
id app >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin app
mkdir -p /srv/counterfactual
command -v rsync >/dev/null || { apt-get -o DPkg::Lock::Timeout=180 update -q && apt-get -o DPkg::Lock::Timeout=180 install -y -q rsync; }
command -v curl >/dev/null || apt-get -o DPkg::Lock::Timeout=180 install -y -q curl
node -v'

step "Syncing allowlisted files to $HOST:$REMOTE"
rsync -azR --delete \
  --exclude '.env*' --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store' \
  --exclude 'persona-swarm/data/twin' --exclude 'persona-swarm/data/city/live' \
  -e "ssh ${SSH_OPTS[*]}" "${PATHS[@]}" "root@$HOST:$REMOTE/"

SHA="$(git rev-parse HEAD)"
DIRTY=false
[ -n "$(git status --porcelain)" ] && DIRTY=true
printf '{"git_sha":"%s","dirty":%s,"deployed_at":"%s"}\n' "$SHA" "$DIRTY" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | ssh_root "cat > $REMOTE/VERSION"
# Code is owned by root and read-only for the service user.
ssh_root "chown -R root:root $REMOTE && chmod -R u=rwX,go=rX $REMOTE && find $REMOTE -name '.env*' -print -delete"
echo "VERSION: $SHA dirty=$DIRTY"

if [ "$SKIP_KEY" = 0 ]; then refresh_key; fi

step "Installing counterfactual.service"
ssh_root "cat > /etc/systemd/system/counterfactual.service" <<'UNIT'
[Unit]
Description=Counterfactual engine API and site (node api/server.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=/srv/counterfactual
EnvironmentFile=/etc/counterfactual.env
Environment=NODE_ENV=production
Environment=COUNTERFACTUAL_HOST=vultr-cloud-compute
Environment=COUNTERFACTUAL_REGION=yto
Environment=COUNTERFACTUAL_PLAN=vc2-1c-2gb
ExecStart=/usr/bin/node api/server.js --port 8080 --host 127.0.0.1
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictRealtime=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
AmbientCapabilities=
SystemCallArchitectures=native
UMask=0077
MemoryMax=1200M

[Install]
WantedBy=multi-user.target
UNIT
ssh_root 'set -e
systemctl daemon-reload
systemctl enable counterfactual >/dev/null 2>&1
systemctl restart counterfactual
for i in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:8080/api/health && { echo "service healthy on 127.0.0.1:8080"; exit 0; }; sleep 1; done
journalctl -u counterfactual -n 40 --no-pager; exit 1'

step "Installing Caddy (official apt repository)"
ssh_root 'set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v caddy >/dev/null; then
  apt-get -o DPkg::Lock::Timeout=180 update -q
  apt-get -o DPkg::Lock::Timeout=180 install -y -q debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get -o DPkg::Lock::Timeout=180 update -q
  apt-get -o DPkg::Lock::Timeout=180 install -y -q caddy
fi
caddy version'

write_caddy() {  # $1 = tls | plain
  local conf
  if [ "$1" = tls ]; then
    # @@AGENTS@@ becomes the persona-agent tunnel routes (ops/agents-tunnel.md) when the VM has
    # /etc/caddy/demo.hash and /etc/caddy/agents.env; otherwise it is dropped. Secrets stay on the VM.
    conf="$DOMAIN {
	header {
		Strict-Transport-Security \"max-age=86400\"
		-Server
	}
@@AGENTS@@
	handle {
		reverse_proxy 127.0.0.1:8080
	}
}

http://$HOST {
	redir https://$DOMAIN{uri} permanent
}
"
  else
    conf="http://$DOMAIN, http://$HOST {
	header -Server
	reverse_proxy 127.0.0.1:8080
}
"
  fi
  printf '%s' "$conf" | ssh_root 'set -e
cat > /etc/caddy/Caddyfile.new
python3 - <<"PY"
import pathlib
p = pathlib.Path("/etc/caddy/Caddyfile.new"); s = p.read_text()
hash_file, env_file = pathlib.Path("/etc/caddy/demo.hash"), pathlib.Path("/etc/caddy/agents.env")
block = ""
if "@@AGENTS@@" in s and hash_file.exists() and env_file.exists():
    h = hash_file.read_text().strip()
    block = """	# The 100 persona agents (Steven) answer from his laptop through an SSH reverse tunnel
	# (VM 127.0.0.1:4179 <-> laptop 127.0.0.1:4179). Caddy adds CONSOLE_ACCESS_KEY from
	# /etc/caddy/agents.env server-side; endpoints that spend his plan need the demo login.
	@agents path /health /ask /chat /run* /replay* /saves* /agents* /usage
	@spend path /ask /chat /run*
	handle @agents {
		basic_auth @spend {
			demo %s
		}
		reverse_proxy 127.0.0.1:4179 {
			header_up Authorization "Bearer {env.CONSOLE_ACCESS_KEY}"
			flush_interval -1
		}
	}
""" % h
p.write_text(s.replace("@@AGENTS@@\n", block))
print("persona-agent tunnel routes:", "on" if block else "off (no /etc/caddy/demo.hash or agents.env)")
PY
chown root:caddy /etc/caddy/Caddyfile.new && chmod 640 /etc/caddy/Caddyfile.new
caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1 || { caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile; exit 1; }
mv -f /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy'
}

BASE="https://$DOMAIN"
if [ "$PLAIN" = 1 ]; then
  write_caddy plain
  BASE="http://$DOMAIN"
else
  step "Configuring HTTPS for $DOMAIN (Let's Encrypt via Caddy)"
  write_caddy tls
  ok=0
  for i in $(seq 1 24); do
    if curl -fsS -o /dev/null --max-time 10 "$BASE/api/health"; then ok=1; break; fi
    sleep 5
  done
  if [ "$ok" = 0 ]; then
    ssh_root 'journalctl -u caddy -n 60 --no-pager | grep -iE "error|challenge|obtain" | tail -n 8' || true
    WARNINGS+=("TLS certificate for $DOMAIN was not issued within 2 minutes; fell back to plain HTTP on :80.")
    write_caddy plain
    BASE="http://$DOMAIN"
  fi
fi

step "Verifying $BASE from this machine"
code() { curl -s -o /dev/null -w '%{http_code}' --path-as-is --max-time 15 "$BASE$1"; }
curl -fsS --max-time 15 "$BASE/api/health"; echo
printf '/experience/ %s   /.env %s   /%%2e%%2e/ %s   /experience/../.env %s   /.git/config %s\n' \
  "$(code /experience/)" "$(code /.env)" "$(code /%2e%2e/)" "$(code /experience/../.env)" "$(code /.git/config)"
curl -sS -o /dev/null --max-time 15 -H 'Content-Type: application/json' -H 'Accept-Encoding: gzip' \
  -w '/api/run fare: HTTP %{http_code}, %{time_total}s, %{size_download} bytes (gzip)\n' -d '{"scenario":"fare","seed":42}' "$BASE/api/run"

print_warnings
echo "Deployed: $BASE/experience/"
