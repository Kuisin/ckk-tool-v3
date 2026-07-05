# shared-db — CKK 共有データベース

Single source of truth for the shared PostgreSQL database (`ckk`) that holds
**all business data** across apps. Runs as the `shared-db` docker-compose stack
on docker-mac-pro (`~/stacks/shared-db`, image `groonga/pgroonga:4.0.6-alpine-17`,
LAN port `192.168.50.15:15432`, in-cluster host `shared-db:5432`).

## One DB, one schema per domain

| Schema | Contents | Writer |
|---|---|---|
| `kot` | hr_records, employees, kot_employees, kot_match_review, import_runs, `v_labor` view | kot-import, admintools (role `kot`) |
| `directory` | employee_directory, ldap_sync_log | vpn-ldap ldap-sync (role `ldap_sync`) |
| `admintools` | mail_accounts, group_members | admintools (role `admintools`) |
| `auth` `master` `bp` `sales` `production` `inventory` `shipping` `billing` `design` `sys` `log` | ckk-tool-v3 business tables (_specs/tables.md), incl. `auth.user_permissions` view | nextjs-web (role `app`) |
| `public` | pass-through compat views only (`sql/metabase-compat.sql`) | — (Metabase reads via `kot_ro`) |

Cross-schema FKs are real (e.g. `sales.quotes → bp.business_partners`,
`kot.hr_records → kot.employees`). Deliberately **no** FK from `kot.employees`
to `directory.employee_directory` (2 legacy usernames absent from AD) and none
on the polymorphic `inventory.inventory_*.inventory_id` / `log.*.user_id`.

## Editing models (the only supported workflow)

```bash
cd shared-db
# 1. edit prisma/schema/*.prisma  (one file per Postgres schema)
pnpm validate
# 2. create + apply a migration (DATABASE_URL in .env → postgres superuser @15432)
pnpm migrate:dev -- --name <change>
# 3. regenerate + resync the app copy
pnpm generate
cd ../docker-compose/nextjs-web && pnpm db:sync-schema && pnpm db:generate
# refresh the Prisma Studio copy too (docker-compose/prisma-studio/prisma/schema)
```

Two synced consumers copy this schema: **nextjs-web** (`prisma/schema`, for
client generation) and **prisma-studio** (`prisma/schema`, for the db.kai-lab.net
browser). Refresh both when models change.

Never hand-edit tables in the DB, never run DDL from the Python apps, and never
run `prisma migrate` from nextjs-web (its `prisma/schema` is a synced copy for
client generation only).

## Roles / connections

Created by `docker-compose/shared-db/init/01-roles.sh` (passwords in the
server-side `~/stacks/shared-db/.env`); grants + per-role `search_path` in
`sql/grants.sql` (idempotent — re-run after adding a schema or role;
`ALTER DEFAULT PRIVILEGES` already covers new tables in existing schemas).

| Role | Used by | search_path | Notes |
|---|---|---|---|
| `kot` | kot-import, admintools KOT_DB_URL | `kot, directory` | legacy `CREATE TABLE IF NOT EXISTS` needs CREATE on schema kot |
| `ldap_sync` | vpn-ldap ldap-sync | `directory, kot` | OWNS directory tables (its `CREATE INDEX IF NOT EXISTS` requires ownership) |
| `admintools` | admintools DATABASE_URL | `admintools` | OWNS its tables (startup `ALTER TABLE` self-migration) |
| `app` | nextjs-web Prisma Client | — (Prisma qualifies) | rw all v3 schemas, ro kot/directory |
| `kot_ro` | Metabase db 2 | `kot, directory` | read-only |
| `studio_ro` | Prisma Studio (db.kai-lab.net) | all schemas | read-only, every schema |
| `postgres` | Prisma migrations only | — | superuser |

Python apps keep psycopg/SQLAlchemy and unqualified table names — the role
search_path maps them to the right schema, so no code changes were needed.

## History

Consolidated 2026-07-05 from the standalone `kot-db` (kot-import stack) and
`admintools-db` (admintools stack) containers. Their compose services were
removed; the old volumes `kot-import_kot-db-data` and
`admintools_admintools-db-data` remain as cold backups. Metabase db 2
(King of Time 労務) now connects to shared-db as `kot_ro`; existing cards keep
working via the `public` compat views.
