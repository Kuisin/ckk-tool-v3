# cloudflared — Cloudflare Tunnel connector

Publishes the app to the public internet at **https://dev.kai-lab.net** via a
Cloudflare Tunnel (no port-forwarding; TLS terminated at Cloudflare's edge).

Deployed on `docker-mac-pro` at `~/stacks/cloudflared` (Dockge-managed). Split out
from the `nextjs-web` stack so each shows up cleanly in Dockge.

## How it works

Remotely-managed (token) tunnel. The connector authenticates with `TUNNEL_TOKEN`;
the public-hostname routing lives in the Cloudflare **Zero Trust** dashboard:

```
Networks > Tunnels > docker-linux > Public Hostname
  dev.kai-lab.net      →  HTTP  →  web:3000          (nextjs-web — relay to Coolify dev app :3004)
  v{X-Y-Z}.ckk.kai-lab.net → HTTP → web-main:3000    (relay to Coolify main app :3005; add at release)
  dockge.kai-lab.net   →  HTTP  →  dockge:5001       (dockge)
  chat.kai-lab.net     →  HTTP  →  open-webui:8080   (ai-stack — Open WebUI GUI)
  monitor.kai-lab.net  →  HTTP  →  grafana:3000      (monitoring — Grafana)
  deploy.ckk-tool.co.jp        →  HTTP  →  coolify:8080           (Coolify dashboard — protect with Access!)
  deploy.ckk-tool.co.jp /app/* →  HTTP  →  coolify-realtime:6001  (realtime websocket, same hostname path rule)
```

`web` / `web-main` are stable socat relays in the `nextjs-web` stack, so Coolify
redeploys and rollbacks never require touching this dashboard config.

The connector joins each target stack's network (`nextjs-web_default` as `web`,
`dockge_default` as `dockge`, `ai-stack_default` as `ai-stack`,
`monitoring_monitoring` as `monitoring`) to resolve those service names, so those
stacks must be up first. Ollama (`:11434`) is intentionally **not** published —
Open WebUI talks to it internally over `ai-stack_default`.

> **Security — protect these with Cloudflare Access:**
> - `dockge.kai-lab.net` — full Docker-management UI with the host console enabled
>   (a root shell). Never expose without an Access policy (email/SSO).
> - `chat.kai-lab.net` — Open WebUI has its own login (first signup = admin), but
>   adding Access in front is still recommended.

## Setup / recreate

```bash
cp .env.example .env          # paste CLOUDFLARE_TUNNEL_TOKEN
docker compose up -d
docker logs cloudflared --tail 20   # expect "Registered tunnel connection"
```

For **LAN** access to the same hostname without the Cloudflare round-trip, see the
`nginx-proxy` stack (local TLS) + a `dev.kai-lab.net → 192.168.50.15` DNS override.
