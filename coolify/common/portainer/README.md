# portainer — Docker management UI (replaced Dockge)

[Portainer CE](https://www.portainer.io/) manages the Docker host via the socket.
Replaces the previous Dockge stack. Deployed on `docker-mac-pro` at
`~/stacks/portainer`.

- **LAN:** <http://192.168.50.15:5001> (same port Dockge used)
- **Public:** https://dock.kai-lab.net (Cloudflare tunnel) / local TLS via nginx

## Why it still answers on `dockge:5001`

Dockge was removed but its network (`dockge_default`) is kept so the cloudflared
tunnel and nginx (which route `dock.kai-lab.net -> http://dockge:5001`) don't break.
Portainer serves HTTP on `:5001` (`--http-enabled --bind :5001`) and joins
`dockge_default` with the **alias `dockge`**, so those routes resolve to Portainer
unchanged. Rename later by repointing the nginx conf + the Cloudflare public
hostname to `portainer:5001` and dropping the alias.

## First run

Open the URL within a few minutes of first start and **create the admin account**
(Portainer locks initialization if you wait too long — `docker restart portainer`
to retry). Then choose the local Docker environment (via the mounted socket).

## Setup / recreate

```bash
docker compose up -d
docker compose logs -f portainer    # watch first-run
```

`portainer-data` (named volume) holds users, settings, and environment config.

> **Security:** Portainer is full Docker control. Keep `dock.kai-lab.net` behind a
> Cloudflare **Access** policy, and it's only on the LAN otherwise.
