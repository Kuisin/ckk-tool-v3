# prisma-studio

Web DB browser (Prisma Studio) for the shared CKK database. Deployed on
docker-mac-pro at `~/stacks/prisma-studio`.

- **URL:** https://db.kai-lab.net (via the cloudflared tunnel)
- **DB role:** `studio_ro` — SELECT on every schema. Browse all tables; edits
  are rejected at the DB (read-only).
- **Internal:** serves `prisma-studio:5555` on the `shared-db` docker network;
  not published to the host.

## Cloudflare hostname (one-time, manual)

This tunnel is remotely managed, so the public hostname is added in the
**Cloudflare Zero Trust dashboard**, not in a config file here:

1. Zero Trust → Networks → Tunnels → (the kai-lab tunnel) → Public Hostname → Add.
2. Subdomain `db`, domain `kai-lab.net`; Service `HTTP` → `prisma-studio:5555`.
3. Strongly recommended: add a **Cloudflare Access** policy on `db.kai-lab.net`
   (email/SSO allowlist). Studio itself has no login — Access is the auth layer.

The cloudflared container already shares the `shared-db` network, so it can
resolve `prisma-studio:5555` as soon as the hostname is saved.

## Updating after schema changes

The `prisma/schema` here is a synced copy of the source of truth in
`shared-db/prisma/schema`. When models change:

```bash
# in repo shared-db/, after editing + migrating:
rm -rf ../docker-compose/prisma-studio/prisma/schema
cp -R prisma/schema ../docker-compose/prisma-studio/prisma/schema
# then on the server: cd ~/stacks/prisma-studio && docker compose up -d --build
```

Studio only reads the schema to render the browser; it never migrates.
