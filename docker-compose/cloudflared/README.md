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
  dev.kai-lab.net     →  HTTP  →  web:3000
  dockge.kai-lab.net  →  HTTP  →  dockge:5001
```

The connector joins each target stack's network (`nextjs-web_default` as `web`,
`dockge_default` as `dockge`) to resolve those service names, so those stacks must
be up first.

> **Security:** Dockge is a full Docker-management UI (with the host console
> enabled = a root shell). Do **not** expose `dockge.kai-lab.net` without putting a
> Cloudflare **Access** policy (email/SSO auth) in front of it.

## Setup / recreate

```bash
cp .env.example .env          # paste CLOUDFLARE_TUNNEL_TOKEN
docker compose up -d
docker logs cloudflared --tail 20   # expect "Registered tunnel connection"
```

For **LAN** access to the same hostname without the Cloudflare round-trip, see the
`nginx-proxy` stack (local TLS) + a `dev.kai-lab.net → 192.168.50.15` DNS override.
