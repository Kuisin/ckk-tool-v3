# kot-import — King of Time auto-importer

Headlessly logs into **King of Time** (`s2.ta.kingoftime.jp/admin`), downloads the
last N days of daily attendance CSV, and upserts it into Postgres (`hr_records`),
on a schedule. Replicates `kuisin/ckk-tool-compose` `_automation/bpo_kot`
(`export_daily_csv.py` + `db.py` vendored under `kot/`).

**Coolify-managed** — app `kot-import` in project ckk, environment `common`, follows
`main`; env vars (`KOT_ID` / `KOT_PW` / `DB_PASSWORD`) live in Coolify. Do **not**
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
- Credentials are read from the environment (`KOT_ID`/`KOT_PW`) — no `.env` file is
  needed inside the container. Without them the scheduler idles.
- Downloaded CSVs live in the container's `kot/downloads/` (ephemeral); the source
  of truth is the DB.
