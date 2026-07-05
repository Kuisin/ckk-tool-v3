# coolify — git-push deployment platform for nextjs-web

Self-hosted [Coolify](https://coolify.io) v4.1.2 on docker-mac-pro (`~/stacks/coolify`).
It builds and runs the **nextjs-web** app from git; every other stack stays on the
rsync + `docker compose up -d --build` flow.

## Topology

| App | Branch | Host port | Public host | Ingress path |
|-----|--------|-----------|-------------|--------------|
| `nextjs-web-dev` | `dev` | `:3004` | `dev.kai-lab.net` | cloudflared/nginx → `web:3000` relay → `:3004` |
| `nextjs-web-main` | `main` | `:3005` | `v{X-Y-Z}.ckk.kai-lab.net` | cloudflared/nginx → `web-main:3000` relay → `:3005` |

- Coolify UI/API: `http://192.168.50.15:8000` (LAN). Root login lives in
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

## GitHub push auto-deploy (optional, needs public URL)

Coolify must be reachable by GitHub. Add a Cloudflare tunnel public hostname
`coolify.kai-lab.net` → `http://coolify:8080` (attach the tunnel to the `coolify`
network in `../cloudflared/docker-compose.yml`), then add a repo webhook:

- Payload URL: `https://coolify.kai-lab.net/webhooks/source/github/events/manual`
- Content type: `application/json`
- Secret: per-app value from `/data/coolify/source/.webhook-secrets`
- Events: `push`

## Upgrades

`AUTOUPDATE=false` — upgrades are deliberate: bump the pinned tags in
`docker-compose.yml` (compare against the `*.upstream` files for structural
changes), rsync, `docker compose up -d`.
