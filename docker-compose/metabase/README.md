# metabase — BI / analytics

[Metabase](https://www.metabase.com/) for dashboards and analytics. Deployed on
`docker-mac-pro` at `~/stacks/metabase`.

- **LAN:** <http://192.168.50.15:3003>
- **App DB:** dedicated Postgres (`metabase-db`) — preferred over embedded H2.

## Setup

```bash
cp .env.example .env
# MB_DB_PASS=<random>
# MB_ENCRYPTION_SECRET_KEY=$(openssl rand -base64 32)   # do NOT change later
docker compose up -d
docker compose logs -f metabase     # first boot runs migrations (~1-2 min)
```

Open the UI and complete the first-run wizard (admin account, etc.). Then add data
sources under **Admin → Databases** (e.g. the application Postgres once it exists).

## Connecting data sources on this host

Metabase reaches a database container by name **only if they share a Docker
network**. To connect it to another stack's DB, attach Metabase to that stack's
network (external) and use the DB's service name + port. For host-level or remote
databases, use the host IP / hostname.

> **Security:** keep on the LAN, or front with nginx + Cloudflare Access like the
> other apps if you publish it.
