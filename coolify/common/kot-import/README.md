# kot-import — King of Time auto-importer

Headlessly logs into **King of Time** (`s2.ta.kingoftime.jp/admin`), downloads the
last N days of daily attendance CSV, and upserts it into Postgres (`hr_records`),
on a schedule. Replicates `kuisin/ckk-tool-compose` `_automation/bpo_kot`
(`export_daily_csv.py` + `db.py` vendored under `kot/`).

**Coolify-managed** — app `kot-import` in project ckk, environment `common`, follows
`main`; env vars (`KOT_ID` / `KOT_PW` / `DB_PASSWORD` / `CRED_ENCRYPTION_KEY` — the
last must match adminTools' and is already provisioned on all three apps
(2026-09-16) by `coolify/platform/add-cred-encryption-key.sh`, see Notes below)
live in Coolify. Do **not**
run `deploy-stack.sh kot-import` (it would start a second importer). Data goes to
**`ckk-db-main`** (db `ckk`, schema `kot`) — there is no separate `kot-db` any more,
and dev has no importer of its own. The run log is read by admintools
(`/kot`, via its `KOT_DB_URL`).

| Service | Role |
|---------|------|
| `kot-import` | scheduler: every `KOT_INTERVAL_SECONDS`, run the Playwright export + DB load |
| (data) | `ckk-db-main` schema `kot`: `hr_records` (attendance), `employees` (code→username map), `kot_employees` (roster), `kot_match_review`, `import_runs` |

## Setup

```bash
cp .env.example .env      # KOT_ID, KOT_PW, DB_PASSWORD
docker compose up -d --build
docker compose logs -f kot-import
```

The scheduler runs immediately on start, then every `KOT_INTERVAL_SECONDS`
(default 6h), pulling the last `KOT_DAYS` (default 7) days. Each run deletes and
re-inserts that date range, so re-runs are idempotent.

## Export layout & columns

The export uses KOT's **出力レイアウト `auto_import_v2`** (`KOT_EXPORT_LAYOUT`, default
`auto_import_v2`; the legacy layout is `auto_import`). Every CSV field is read **by
header name** (`INT_FIELDS` / `TEXT_FIELDS` in `kot/db.py`), never by position, and each
lists the legacy header as a fallback. A layout missing a required header is rejected
*before* the date range is deleted (a wrong layout used to parse as all-zero rows and
overwrite good data).

**Adding an export column** = one line in `db.py` + `ALTER TABLE` in
`shared-db/sql/kot-columns.sql`. The `kot` schema is not Prisma-managed and role `kot`
does not own `hr_records`, so that SQL is run **as postgres, before** deploying the
importer (otherwise the INSERT fails and the run is recorded as failed — the delete is
rolled back, so nothing is lost). New columns are NULL for rows imported with the old
layout (NULL = the layout had no such field, 0 = it did and the value was 0). They are
also exposed in `kot.v_labor`; Metabase needs a schema re-sync to see them.

## Employee mapping (required for rows to land)

`db.py` maps the KOT `従業員コード` → an AD `username` via the **`employees`** table
(`employee_code`, `username`). Rows for unmatched codes are skipped and logged. Seed
it, e.g.:

```sql
INSERT INTO employees (employee_code, username) VALUES (1001, 'k.sawada') ...;
```

(In the full system this is kept in sync from AD; populate it however suits you —
manually, a CSV, or a future sync.)

## Notes
- Credentials (`KOT_ID`/`KOT_PW`) can be edited from adminTools (`/kot` → 「King of
  Time 管理者ログイン」→ 編集) — that writes an encrypted row into `kot_settings`
  (same `ckk` DB, `kot` schema) which this container reads on every run
  (`db.get_kot_credentials()`), no redeploy needed. Decrypting that row requires
  `CRED_ENCRYPTION_KEY` to match adminTools' — without it (or the env vars/DB row
  both absent) the env vars `KOT_ID`/`KOT_PW` are the fallback, same as before this
  feature existed. A missing credential now fails fast and is recorded to
  `import_runs` (visible in adminTools' `/kot` log) rather than silently idling.
- Downloaded CSVs live in the container's `kot/downloads/` (ephemeral); the source
  of truth is the DB.
