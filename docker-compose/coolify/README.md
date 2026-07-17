# coolify — git-push deployment platform for nextjs-web

Self-hosted [Coolify](https://coolify.io) v4.1.2 on docker-mac-pro (`~/stacks/coolify`).
It builds and runs the **nextjs-web** app from git; every other stack stays on the
rsync + `docker compose up -d --build` flow.

## Topology

Project `ckk` — dev app in the `development` environment, main in `production`:

| App | Env | Branch | Host port | Public host | Ingress path |
|-----|-----|--------|-----------|-------------|--------------|
| `nextjs-web-dev` | development | `dev` | `:3004` | `ckk-dev.kai-lab.net` (legacy alias: `dev.kai-lab.net`) | cloudflared/nginx → `web:3000` relay → `:3004` |
| `nextjs-web-main` | production | `main` | `:3005` | `ckk.kai-lab.net` | cloudflared/nginx → `web-main:3000` relay → `:3005` |
| `admintools-dev` | production | `dev` | `:8090` | `admin-dev.ckk-tool.co.jp` (Cloudflare **Access**) | tunnel → `admin-dev:8000` relay → `:8090` |
| `admintools-main` | production | `main` | `:8091` | `admin.ckk-tool.co.jp` (Cloudflare **Access**) | tunnel → `admin:8000` relay → `:8091` |

`admintools` (mail-account mgmt + DB/storage **restore** tool) mirrors nextjs-web:
a **dev** app (branch `dev`) and a **prod** app (branch `main`), both Coolify-built
(`dockerfile`, base dir `/docker-compose/admintools`), auto-deploying from GitHub.
Env (DB / LDAP / Sakura / restore-agent) is set in Coolify; both reach `shared-db`,
`vpn-ldap`, `restore-agent` by name on the `coolify` network and share the one
`admintools` DB schema. **It has no built-in auth**, so both public hostnames are
gated by **Cloudflare Access** (allow-list) — never remove that. Cloudflared reaches
each via the `admin-dev` / `admin` socat relays in the `nextjs-web` stack (host
ports 8090/8091, stable across Coolify's per-deploy container names).
Deploy/rollback: `./deploy.sh admin-dev [<sha>]` / `./deploy.sh admin-main [<sha>]`.

- Coolify UI/API: `https://deploy.ckk-tool.co.jp` (LAN via nginx-proxy; public via
  cloudflared once the tunnel hostnames are added — put a Cloudflare Access policy
  in front). Direct LAN fallback: `http://192.168.50.15:8000`. Root login lives in
  `/data/coolify/source/.env` (server-only). API token: `/data/coolify/source/.api-token`.
- Coolify's Traefik proxy is **not** used (nginx-proxy owns 80/443); apps publish
  plain host ports and the `web`/`web-main` socat relays in the `nextjs-web` stack
  give cloudflared/nginx stable names — deploys and rollbacks never change routing.
- Apps run on the external `coolify` docker network; `shared-db`, `po-extract`,
  `gotenberg`, `seaweedfs` are attached to it so the app resolves them by name.
- The host is managed over SSH as `kaiseisawada` (non-root, docker group) with the
  key Coolify stores under `/data/coolify/ssh/keys/` (`ssh_key@…`, imported into its
  DB at seed time). Non-root management requires **passwordless sudo** for that
  user: `/etc/sudoers.d/kaiseisawada-coolify` with
  `kaiseisawada ALL=(ALL) NOPASSWD: ALL` (mode 440).

## First-time bootstrap

```bash
ssh 192.168.50.15 'bash ~/stacks/coolify/setup.sh'
```

Idempotent — safe to re-run. See the step list in `setup.sh`.

## Deploying

- **dev**: push to `dev` → run `./deploy.sh dev` (or Coolify UI → nextjs-web-dev →
  Deploy). With a public webhook configured (below), pushes deploy automatically.
- **main (production)**: open a PR `dev` → `main`, merge, then `./deploy.sh main`.
  Never commit straight to `main`.
- **Rollback (main)**: Coolify UI → nextjs-web-main → *Deployments* → pick a
  previous successful deployment → *Redeploy this commit*. Each deployment's
  image is kept, so rollback is image-swap fast (no rebuild). CLI equivalent:
  `./deploy.sh main <git-sha>`.

## Dashboard at deploy.ckk-tool.co.jp

- **LAN**: nginx-proxy vhost `deploy.ckk-tool.co.jp` (wildcard cert
  `_.ckk-tool.co.jp.{crt,key}`) proxies `/` → `coolify:8080`, `/app/` →
  `coolify-realtime:6001` (websocket), `/terminal/ws` → `coolify-realtime:6002`.
  Needs the LAN DNS override `deploy.ckk-tool.co.jp → 192.168.50.15`.
- **Public**: Cloudflare Zero Trust public hostnames (see `../cloudflared/README.md`):
  `deploy.ckk-tool.co.jp` → `http://coolify:8080` and path rule `/app/*` →
  `http://coolify-realtime:6001`. **Add a Cloudflare Access policy** — this UI has
  full deploy rights over the server.

## GitHub push auto-deploy (optional, needs the public hostname above)

Once `deploy.ckk-tool.co.jp` is publicly reachable, add a repo webhook:

- Payload URL: `https://deploy.ckk-tool.co.jp/webhooks/source/github/events/manual`
  (Access policy must bypass/service-auth this path, or GitHub can't reach it)
- Content type: `application/json`
- Secret: per-app value from `/data/coolify/source/.webhook-secrets`
- Events: `push`

## Upgrades

`AUTOUPDATE=false` — upgrades are deliberate: bump the pinned tags in
`docker-compose.yml` (compare against the `*.upstream` files for structural
changes), rsync, `docker compose up -d`.
