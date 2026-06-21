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
  dev.kai-lab.net  →  HTTP  →  web:3000
```

The connector reaches `web:3000` over the external `nextjs-web_default` network
(declared here as network `web`), so the `nextjs-web` stack must be up first.

## Setup / recreate

```bash
cp .env.example .env          # paste CLOUDFLARE_TUNNEL_TOKEN
docker compose up -d
docker logs cloudflared --tail 20   # expect "Registered tunnel connection"
```

For **LAN** access to the same hostname without the Cloudflare round-trip, see the
`nginx-proxy` stack (local TLS) + a `dev.kai-lab.net → 192.168.50.15` DNS override.
