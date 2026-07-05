# shared-db — CKK 共有データベース

Single source of truth for the shared PostgreSQL database (`ckk`) that holds
**all business data** across apps. Runs as the `shared-db` docker-compose stack
on docker-mac-pro (`~/stacks/shared-db`, image `groonga/pgroonga:4.0.6-alpine-17`,
LAN port `192.168.50.15:15432`, in-cluster host `shared-db:5432`).

## One DB, one schema per domain

| Schema | Contents | Writer |
|---|---|---|
| `kot` | hr_records, employees, kot_employees, kot_match_review, import_runs, `v_labor` view | kot-import, admintools (role `kot`) |
| `directory` | employee_directory (+ `ldap_guid`: the immutable AD objectGUID apps FK to), ldap_sync_log | vpn-ldap ldap-sync (role `ldap_sync`) |
| `admintools` | mail_accounts, group_members | admintools (role `admintools`) |
| `app` | ALL ckk-tool-v3 business tables in ONE schema — RBAC (users/roles/permissions), master data, business partners, sales (試算 → 価格表 → 見積書) — incl. the `app.user_permissions` view | nextjs-web (role `app`) |
| `public` | pass-through compat views only (`sql/metabase-compat.sql`) | — (Metabase reads via `kot_ro`) |

The v3 web app owns a **single** `app` schema (Prisma-managed). Its scope is
deliberately **minimal**: 試算 (`app.estimates` + `estimate_tiers`), 価格表
(`app.price_list_entries` + `price_list_tiers` + `price_list_discounts`), 見積書
(`app.quotes` + `quote_items`), their master-data deps (`app.material_types` /
`materials` / `products`), business partners (`app.business_partners` + attrs),
`app.files` / `numbering_sequences`, and RBAC (`app.users` / `roles` /
`permissions`). Downstream domains (production / inventory / shipping / billing /
design / log, 受注請書以降) are added table-by-table when their feature lands.

Cross-schema FKs are real — notably `app.users.employee_id → directory.employee_directory.ldap_guid`
(the app's identity link to the shared, AD-synced employee directory, keyed by
the immutable objectGUID so AD renames never orphan the reference). Deliberately
**no** FK from `kot.employees`
to `directory.employee_directory` (2 legacy usernames absent from AD).

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

## Demo data

`pnpm seed:demo` applies `sql/demo-seed.sql` — idempotent demo rows for the
master screens (材種 / 素材 / 製品). Demo product codes use past months
(`PRD-202606-*`) so they never collide with the app's monthly `PRD`
auto-numbering (`sys.numbering_sequences`).

## Backup / restore

`./scripts/backup.sh` (DATABASE_URL from `.env`) writes to `backups/`
(gitignored):
- `ckk-<ts>.dump` — full custom-format dump (DDL + data + views), for disaster
  recovery: `pg_restore -d <url> --clean --create ckk-<ts>.dump`.
- `ckk-<ts>.data.sql` — plain-SQL INSERTs of all app schemas, for re-seeding a
  freshly migrated DB.

## Reset / re-baseline (clean initial migration)

The migration history was re-baselined on 2026-07-05 into a single clean
`*_init` migration (the pre-trim history was squashed). A DB created with the
old history has a stale `_prisma_migrations` table, so `migrate deploy` will
refuse — reset it like this (server: `docker exec -it shared-db psql -U postgres`):

```bash
cd shared-db
./scripts/backup.sh                     # 1. backup (see above)
psql "$ADMIN_URL" -c 'DROP DATABASE ckk;' -c 'CREATE DATABASE ckk;'   # 2. reset
pnpm migrate:deploy                     # 3. clean init → all schemas + views
psql "$ADMIN_URL" -d ckk -f sql/grants.sql   # 4. roles/grants (idempotent)
pg_restore -d "$DATABASE_URL" --data-only --disable-triggers \
  -n kot -n directory -n admintools -n auth -n master -n bp -n sales -n sys \
  backups/ckk-<ts>.dump                 # 5. restore data
psql "$ADMIN_URL" -d ckk -f sql/metabase-compat.sql  # 6. public compat views
```

The init migration guards `CREATE EXTENSION pgroonga` in a `DO` block so it
also applies on dev hosts without pgroonga (production's
`groonga/pgroonga` image always has it).

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
