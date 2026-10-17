# Steven's persona agents on the hosted site (SSH reverse tunnel)

The public site `https://twotwosmyworld.select/experience/` reaches Steven's 100 Twin-tuned Claude Haiku persona agents through his laptop. The agents run on his Claude Max plan. The Vultr VM holds **no** model key and no Claude credential.

```text
browser → Caddy (VM :443) ── /health /ask /chat /run* /replay* /saves* /agents* /usage ──► 127.0.0.1:4179 on the VM
                                                                                              ⇅ SSH reverse tunnel
                                                                              Steven's laptop 127.0.0.1:4179 (agent server)
        └── everything else (site, /api/run, /api/compile, /api/sweep, /api/clef) ─► api/server.js on 127.0.0.1:8080
```

Status, 17 Oct 13:20 ET: the VM side is configured and verified with a stand-in server. `/health` and `/ask` returned through the tunnel with the access key attached, the streams flushed incrementally, and the tunnel's absence gave a 502. The first real answers arrive once Steven opens the tunnel.

## What is on the VM (done; repeat only on a new VM)

| Piece | Where | Notes |
| --- | --- | --- |
| Tunnel-only user | `tunnel`, shell `/usr/sbin/nologin` | `~tunnel/.ssh/authorized_keys` holds Steven's key with `restrict,port-forwarding,permitlisten="127.0.0.1:4179"`. That user can forward only VM-local port 4179: no shell, PTY, agent or X11. `GatewayPorts no`, so 4179 never faces the internet. OpenSSH 9.6. |
| Access key | `/etc/caddy/agents.env` (root, 0600) | `CONSOLE_ACCESS_KEY=…` from Steven's `persona-swarm/.env`. systemd reads it through the drop-in `/etc/systemd/system/caddy.service.d/agents.conf`. That drop-in also removes the package's `--environ` flag, so the key is never printed to the journal. |
| Routes | `/etc/caddy/Caddyfile` | `ops/deploy.sh` regenerates them on every deploy whenever `agents.env` exists. All agent routes are **public, with no login** (team decision, 17 Oct 13:40). Anyone with the URL can run polls on Steven's plan, so his server's plan-limit stop is the only spending cap. `header_up Authorization "Bearer {env.CONSOLE_ACCESS_KEY}"` attaches the key server-side. `flush_interval -1` keeps answer streams live. |

Secrets are shared by private message only. Never put them in git, chat logs, the Caddyfile, or a command line on the VM. To set them up on a new VM, pipe them over SSH stdin:

```sh
# the access key as one line on stdin
ssh -i ~/.ssh/vultr_htv_ed25519 root@<ip> 'umask 077; read -r k; printf "CONSOLE_ACCESS_KEY=%s\n" "$k" > /etc/caddy/agents.env
  printf "[Service]\nEnvironmentFile=/etc/caddy/agents.env\nExecStart=\nExecStart=/usr/bin/caddy run --config /etc/caddy/Caddyfile\n" > /etc/systemd/system/caddy.service.d/agents.conf
  systemctl daemon-reload'
ops/deploy.sh --skip-key   # writes the Caddyfile with the agent routes, restarts nothing else
```

## Steven: going live from your laptop

1. Start the agent server on the tunnel port, requiring the key: `npm --prefix persona-swarm/runtime start -- --port 4179 --require-key`. It uses your `local` Claude login and the `CONSOLE_ACCESS_KEY` in `persona-swarm/.env`.
2. Open the tunnel and keep it open during the demo:

   ```sh
   ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
       -R 127.0.0.1:4179:127.0.0.1:4179 tunnel@155.138.141.130
   ```

   For automatic reconnects, use `autossh -M 0` with the same arguments.
3. Check from anywhere: `curl -s https://twotwosmyworld.select/health` should return your server's health JSON, and the site's corner pill should read `LIVE · 100 PERSONA AGENTS`.

If the laptop sleeps or the tunnel drops, `/health` returns 502. The page then says "agents offline" and keeps working: the mapped paired run, charts, ledger and compiler all run on the Vultr engine. For a laptop-free fallback, run the site locally with `AGENT_BACKEND=replay`; see [persona-swarm/RUNTIME.md](../persona-swarm/RUNTIME.md).

## Judges and teammates

Open the site; nothing needs a login. To limit who can spend Steven's plan, restore a Caddy `basic_auth` on `/ask /chat /run*` inside `handle @agents` (`caddy hash-password` reads the password from stdin), then `systemctl reload caddy`. Also add the `basic_auth` block to the template in `ops/deploy.sh`, or the next deploy removes it.

## Remove it after the event

```sh
ssh -i ~/.ssh/vultr_htv_ed25519 root@155.138.141.130 'rm -f /etc/caddy/agents.env /etc/caddy/demo.hash; userdel -r tunnel'
ops/deploy.sh --skip-key        # rewrites the Caddyfile without the agent routes
```

Destroying the VM (`node ops/vultr.js destroy <id> --yes`) removes all of it.
