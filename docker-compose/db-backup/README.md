# db-backup — scheduled PG17 incremental backups of shared-db

Tiered physical backups of the `shared-db` cluster (DB `ckk`) using Postgres 17
native **incremental base backups** — snapshot-like efficiency without
filesystem snapshots: hourly backups store only blocks changed since the day's
full. RPO ≤ 1 hour.

| Tier | When | What | Kept |
|------|------|------|------|
| `daily/YYYY-MM-DD/` | first tick of each day (00:xx) | full `pg_basebackup` | 7 days (`DAILY_KEEP_DAYS`) |
| `hourly/YYYY-MM-DDTHH/` | every other hour | incremental vs the newest daily full | 24 h (`HOURLY_KEEP_HOURS`) |
| `monthly/YYYY-MM/` | month's first daily | hardlink promote (`cp -al`, ~0 extra disk) | 12 (`MONTHLY_KEEP`) |

One loop container (`entrypoint.sh`) ticks at the top of every hour and runs
`backup.sh run`, which decides the tier, verifies each backup with
`pg_verifybackup`, moves it into place atomically, then prunes.

**Chain safety** — hourly incrementals anchor *directly* on the newest full
(depth-1 chain) and record it in an `anchor` file. Pruning never removes the
newest full nor a full still referenced by a surviving hourly, so every kept
backup stays restorable. An hourly dir *without* an `anchor` file is a
standalone full (fallback taken when incrementals weren't possible yet).

**Out of scope**: WAL archiving / point-in-time recovery — granularity is the
hourly tier. `pg_dump` remains the ad-hoc tool for pre-migration copies and
for `metabase-db` / `coolify-db` / `ckk-legacy-db`.

## Deploy

```bash
# from repo: docker-compose/db-backup/
rsync -avn --exclude .env ./ 192.168.50.15:'~/stacks/db-backup/'   # dry-run first
rsync -a  --exclude .env ./ 192.168.50.15:'~/stacks/db-backup/'
ssh 192.168.50.15 'cd ~/stacks/db-backup && docker compose up -d --build'
ssh 192.168.50.15 'docker logs -f db-backup'    # watch the first tick
```

`~/stacks/db-backup/.env` (server only, never commit):

```
BACKUP_DB_PASSWORD=<same value as in shared-db's .env>
# optional overrides:
# BACKUP_DIR=/data/db-backups   TZ=Asia/Tokyo
# HOURLY_KEEP_HOURS=24  DAILY_KEEP_DAYS=7  MONTHLY_KEEP=12
```

## One-time migration of the live shared-db (do this before first deploy)

The `backup` role is created by `init/01-roles.sh` **only on fresh clusters**;
the live cluster needs it added manually, and `summarize_wal` must be on
before incrementals can work.

```bash
ssh 192.168.50.15

# 1. generate a password; add BACKUP_DB_PASSWORD=<pw> to BOTH
#    ~/stacks/shared-db/.env and ~/stacks/db-backup/.env
openssl rand -base64 24

# 2. create the replication role on the live cluster
docker exec shared-db psql -U postgres -d ckk \
  -c "CREATE ROLE backup WITH REPLICATION LOGIN PASSWORD '<pw>';"

# 3. backup destination on the host (70:70 = postgres uid/gid in alpine)
sudo mkdir -p /data/db-backups && sudo chown 70:70 /data/db-backups

# 4. sanity-check the repo pg_hba against the live one before switching
docker exec shared-db cat /var/lib/postgresql/data/pg_hba.conf

# 5. deploy the updated shared-db stack (recreates the container — a few
#    seconds of DB downtime; pick a quiet moment)
#    (from repo: rsync docker-compose/shared-db/ up, then:)
cd ~/stacks/shared-db && docker compose up -d

# 6. verify
docker exec shared-db psql -U postgres -c "SHOW summarize_wal;"          # -> on
docker exec shared-db psql -U postgres -c "SELECT rolname, rolreplication FROM pg_roles WHERE rolname='backup';"
```

Then deploy db-backup (above). First tick takes the daily full; the next hour
takes the first incremental. If an incremental can't be served yet (WAL
summaries start only after `summarize_wal=on`), the script logs a warning and
self-heals by taking a full.

## Monitoring

- `docker logs db-backup` (`[db-backup]` lines; picked up by the existing
  Loki/Alloy pipeline like other stacks).
- `/data/db-backups/latest-status` — one line: `2026-07-05T13:00 hourly OK size=12M`.
- Healthy state: newest `hourly/` (or today's `daily/`) is **< 2 h old**.

## Restore runbook

Pick a restore point: a monthly/daily **full** alone, or full **+ one hourly**
for intra-day state (the hourly's `anchor` file names the full it needs).

```bash
# 1. verify the pieces (read-only)
docker run --rm -v /data/db-backups:/backups:ro ckk-db-backup \
  pg_verifybackup /backups/daily/2026-07-05
docker run --rm -v /data/db-backups:/backups:ro ckk-db-backup \
  pg_verifybackup /backups/hourly/2026-07-05T13

# 2a. full only — plain copy
sudo cp -a /data/db-backups/daily/2026-07-05 /data/db-restore-data

# 2b. full + hourly — combine (order: full first, then the incremental)
docker run --rm -v /data/db-backups:/backups:ro -v /data:/data ckk-db-backup \
  pg_combinebackup /backups/daily/2026-07-05 /backups/hourly/2026-07-05T13 \
  -o /data/db-restore-data

# 3. permissions
sudo chown -R 70:70 /data/db-restore-data && sudo chmod 700 /data/db-restore-data

# 4. start a scratch instance on the restored dir — it replays the streamed
#    WAL to consistency; then sanity-check
docker run --rm -d --name db-restore-check \
  -v /data/db-restore-data:/var/lib/postgresql/data \
  groonga/pgroonga:4.0.6-alpine-17
docker exec db-restore-check psql -U postgres -d ckk -c "SELECT count(*) FROM sales.quotes;"  # any sanity query
docker stop db-restore-check

# 5. ONLY for real disaster recovery — swap into the live volume:
cd ~/stacks/db-backup   && docker compose down          # stop the backup loop
#    stop app stacks that use the DB (nextjs-web via Coolify, kot-import, …)
cd ~/stacks/shared-db   && docker compose down
docker run --rm -v shared-db-data:/target -v /data/db-restore-data:/src alpine \
  sh -c 'rm -rf /target/* && cp -a /src/. /target/'
cd ~/stacks/shared-db   && docker compose up -d          # verify, then restart apps + db-backup
```

Run steps 1–4 as a **quarterly restore drill** against a scratch directory.
