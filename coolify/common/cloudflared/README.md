# cloudflared — Cloudflare Tunnel connector

Publishes the app to the public internet at **https://app-dev.ckk-tool.co.jp** via a
Cloudflare Tunnel (no port-forwarding; TLS terminated at Cloudflare's edge).

Deployed on `docker-mac-pro` at `~/stacks/cloudflared` (Dockge-managed). Split out
from the `nextjs-web` stack so each shows up cleanly in Dockge.

## How it works

Remotely-managed (token) tunnel. The connector authenticates with `TUNNEL_TOKEN`;
the public-hostname routing lives in the Cloudflare **Zero Trust** dashboard:

```
Networks > Tunnels > docker-linux > Public Hostname
  app-dev.ckk-tool.co.jp  →  HTTP  →  web:3000          (nextjs-web dev — relay to Coolify :3004;
                                                      app-dev.ckk-tool.co.jp kept as legacy alias)
  app.ckk-tool.co.jp      →  HTTP  →  web-main:3000     (nextjs-web main/production — relay to :3005)
  app.ckk-tool.co.jp   →  HTTP  →  web-main:3000     (same production app, ckk-tool.co.jp alias)
  ckk-kiosk-dev.kai-lab.net → HTTP → kiosk:3000      (nextjs-kiosk dev — `coolify` 網の別名 kiosk;
                                                      WS /api/kiosk/ws passes through)
  ckk-kiosk.kai-lab.net →  HTTP  →  kiosk-main:3000  (nextjs-kiosk main — relay to :3007)
  dockge.kai-lab.net   →  HTTP  →  dockge:5001       (dockge)
  chat.kai-lab.net     →  HTTP  →  open-webui:8080   (ai-stack — Open WebUI GUI)
  monitor.kai-lab.net  →  HTTP  →  grafana:3000      (monitoring — Grafana)
  deploy.ckk-tool.co.jp        →  HTTP  →  coolify:8080           (Coolify dashboard — protect with Access!)
  deploy.ckk-tool.co.jp /app/* →  HTTP  →  coolify-realtime:6001  (realtime websocket, same hostname path rule)
```

`web` / `web-main` are stable socat relays in the `nextjs-web` stack, so Coolify
redeploys and rollbacks never require touching this dashboard config.

2026-08-25 以降、コネクタが参加するネットワークは **`coolify` の 1 本だけ**。
各サービスは `custom_network_aliases` でそこに安定した名前を張っている
（`web` / `web-main` / `kiosk` / `kiosk-main` / `admin` / `admin-dev` /
`dockge` / `open-webui` / `metabase` / `grafana`）。

以前はスタックごとの compose 網（`nextjs-web_default`,
`dockge_default`, `ai-stack_default`, …）を名前でたぐっていたが、
`monitoring_monitoring` as `monitoring`) to resolve those service names, so those
stacks must be up first. Ollama (`:11434`) is intentionally **not** published —
Open WebUI talks to it internally over the ai-stack's own network.

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
`nginx-proxy` stack (local TLS) + a `app-dev.ckk-tool.co.jp → 192.168.50.15` DNS override.
