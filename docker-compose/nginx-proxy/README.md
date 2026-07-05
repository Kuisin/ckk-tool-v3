# nginx-proxy — LAN TLS reverse proxy for dev.kai-lab.net

Nginx (techstack #8) terminating HTTPS on the LAN for **https://dev.kai-lab.net**
and proxying to the `nextjs-web` `web` service. TLS is a real Let's Encrypt cert
(browser-trusted) issued via Cloudflare **DNS-01**, so no inbound ports are needed
and it works even though the host isn't publicly reachable.

Deployed on `docker-mac-pro` at `~/stacks/nginx-proxy` (Dockge-managed).

```
Internet ─┐
          ├─ (external) Cloudflare edge → tunnel → web:3000
LAN ──────┘  dev.kai-lab.net → 192.168.50.15:443 → nginx → web:3000   ← this stack
```

## Services

| Service | Role |
|---------|------|
| `acme`  | `acme.sh` daemon — issues/renews the LE cert via Cloudflare DNS-01 into `./certs`; checks renewals daily |
| `nginx` | serves `./certs`, proxies `dev.kai-lab.net` → `web:3000`; self-reloads daily to apply renewals |

## Setup

1. **Cloudflare API token** — dashboard → My Profile → API Tokens → Create Token.
   Permissions: **Zone → DNS → Edit** (and Zone → Zone → Read), scoped to
   `kai-lab.net`. Put it in `.env`:

   ```bash
   cp .env.example .env
   # CLOUDFLARE_DNS_API_TOKEN=<token>
   ```

2. **Start acme + issue the cert** (nginx won't start until the cert exists):

   ```bash
   docker compose up -d acme
   docker exec nginx-acme --register-account -m kaisei0807s@gmail.com --server letsencrypt
   docker exec nginx-acme --issue --dns dns_cf -d dev.kai-lab.net --server letsencrypt
   docker exec nginx-acme --install-cert -d dev.kai-lab.net \
     --key-file       /certs/dev.kai-lab.net.key \
     --fullchain-file /certs/dev.kai-lab.net.crt
   ```

3. **Start nginx:**

   ```bash
   docker compose up -d nginx
   ```

Renewal is automatic: `acme` rewrites `./certs` every ~60 days, `nginx` reloads daily.

## LAN DNS override (required for local routing)

For LAN clients to hit this proxy instead of Cloudflare, resolve the hostname to
the host on your local DNS:

```
dev.kai-lab.net  →  192.168.50.15
```

Add this on your LAN resolver (the box serving the `ckk.lan` zone / your router).
Without it, `dev.kai-lab.net` still works but routes out via Cloudflare. External
access continues to work either way through the existing tunnel.

## Adding more hostnames

Drop another `*.conf` in `conf.d/`, issue/install its cert into `./certs`, and
`docker exec nginx-proxy nginx -s reload`.
