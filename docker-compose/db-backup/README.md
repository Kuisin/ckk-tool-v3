# db-backup — scheduled PG17 incremental backups of shared-db

Tiered physical backups of the `shared-db` cluster (DB `ckk`) using Postgres 17
native **incremental base backups** — snapshot-like efficiency without
filesystem snapshots: hourly backups store only blocks changed since the day's
full. RPO ≤ 1 hour.

| Tier | When | What | Kept |
|------|------|------|------|
| `daily/YYYY-MM-DD/` | first tick of each day (00:xx) | full `pg_basebackup` | 14 days (`DAILY_KEEP_DAYS`) |
| `hourly/YYYY-MM-DDTHH/` | every other hour | incremental vs the newest daily full | 72 h (`HOURLY_KEEP_HOURS`) |
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
# HOURLY_KEEP_HOURS=72  DAILY_KEEP_DAYS=14  MONTHLY_KEEP=12
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

## SeaweedFS バックアップ（seaweed-backup サービス）

業務文書（受注書スキャン原本・証憑・生成 PDF）を持つ SeaweedFS の
`nextjs-web_seaweed-data` ボリュームを毎日 03:00（TZ）に tar スナップショット:

- `/data/db-backups/seaweedfs/daily/YYYY-MM-DD.tar.gz` — 既定 14 日保持
- `/data/db-backups/seaweedfs/monthly/YYYY-MM.tar.gz` — 月初分を昇格、12 世代

**復元**: `docker compose -f ~/stacks/nextjs-web/docker-compose.yml stop seaweedfs` →
ボリュームの中身を退避 → `docker run --rm -v nextjs-web_seaweed-data:/data -v /data/db-backups/seaweedfs/daily:/b alpine sh -c 'rm -rf /data/* && tar -xzf /b/<DATE>.tar.gz -C /data'` →
seaweedfs を起動。DB の `files.storage_key` と整合する時点の DB バックアップと
セットで戻すこと。

## オフサイト（クラウド）同期 — offsite-backup サービス

`/data/db-backups` 全体（PG 増分 + SeaweedFS tar）を **毎日 04:30 に rclone で
クラウドへミラー**する。ホスト障害・盗難・災害からの保全（3-2-1 の「1」）。

**有効化**（サーバーの `~/stacks/db-backup/.env` に追記 — コミット禁止）:

```ini
# 例 A: さくらのレンタルサーバー（SFTP — 契約済みストレージを流用）
OFFSITE_REMOTE=sakura:ckk-backups
RCLONE_CONFIG_SAKURA_TYPE=sftp
RCLONE_CONFIG_SAKURA_HOST=ckk-tool.sakura.ne.jp
RCLONE_CONFIG_SAKURA_USER=<さくらアカウント>
RCLONE_CONFIG_SAKURA_PASS=<rclone obscure したパスワード>   # docker run --rm rclone/rclone obscure '<平文>'

# 例 B: Cloudflare R2（S3 互換 — 10GB まで無料、Cloudflare 契約に同居）
OFFSITE_REMOTE=r2:ckk-backups
RCLONE_CONFIG_R2_TYPE=s3
RCLONE_CONFIG_R2_PROVIDER=Cloudflare
RCLONE_CONFIG_R2_ACCESS_KEY_ID=<key>
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=<secret>
RCLONE_CONFIG_R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
```

適用: `docker compose up -d offsite-backup`。`OFFSITE_REMOTE` 未設定なら安全に
待機する（何も送らない）。初回は手動同期で検証を推奨:

```sh
docker exec offsite-backup rclone sync /backups "$OFFSITE_REMOTE" --dry-run --stats-one-line
```

**復元**: `rclone copy <remote>:ckk-backups /data/db-backups` で取り戻し、
上記の PG / SeaweedFS 復元手順に接続する。

**注意**: 保持世代はソース側で管理（sync はミラー）。バックアップには業務
文書・個人情報が含まれるため、リモート側のアクセス権は最小化すること。
機密性を上げたい場合は rclone crypt リモートを挟む（README 追補可）。

## 論理バックアップ（logical-dump サービス）

物理 `pg_basebackup`（上記）はクラスタ全体の低レベル DR 用。それとは別に、
`logical-dump` が毎日 02:30 に **`pg_dump -Fc`（カスタム形式）** の自己完結
スナップショットを取る。これは復元ツール（下記 restore-agent）が稼働中の DB へ
`pg_restore --clean` でワンクリック復元できる単位。

- `/data/db-backups/logical/daily/<YYYY-MM-DD>.dump` — 既定 14 日（`LOGICAL_KEEP_DAYS`）
- `/data/db-backups/logical/monthly/<YYYY-MM>.dump` — 月初分を昇格、12 世代
- `/data/db-backups/logical/manual/*.dump` — 手動配置分も復元候補に出る

`LOGICAL_DB_URL`（= restore-agent の `RESTORE_DB_URL` と同じスーパーユーザ DSN）
未設定なら待機のみ（安全に無効）。

## 復元ツール（restore-agent サービス + admintools UI）

**操作者向け UI は admintools の「バックアップ / 復元」アプリ**（web-facing）。
そこから **restore-agent**（この db-backup スタック内の非公開サービス）を
トークン付きで呼び、実際の復元を実行する。危険な破壊操作を web アプリに直接
持たせない設計 — **Docker ソケットを持つのは restore-agent だけ**。

できること（各対象は任意に組合せ可）:
- **DB 復元** — 論理 dump（logical/ または pre-restore/）を `pg_restore --clean --if-exists`
  で `ckk` に戻す（他接続を `pg_terminate_backend` してから実行 → 一時ダウンタイム）。
- **ストレージ復元** — SeaweedFS tar を、`nextjs-seaweedfs` を停止 → ボリューム
  入替 → 起動、で戻す。
- **アプリ版数復元** — Coolify API で `nextjs-web-main` を復元ポイントの git commit へ
  ピン＋再デプロイ（DB・ストレージ復元の**後**に実行）。

**安全機構**:
- 復元の**直前に at-point フルバックアップ**（DB dump + Seaweed tar）を
  `pre-restore/<日時>/` へ自動取得。**緊急時のみ** UI のチェックでスキップ可。
- 確認フレーズ `RESTORE` 必須、一度に1操作のみ、
  全操作を `/data/db-backups/restore-log.jsonl` に追記（DB 復元でも消えない）。

**サーバ `.env`（コミット禁止）**:

```ini
# restore-agent
RESTORE_AGENT_TOKEN=<openssl rand -hex 24>          # admintools と共有
RESTORE_DB_URL=postgresql://postgres:<pw>@shared-db:5432/ckk   # 空 = DB 復元無効
LOGICAL_DB_URL=postgresql://postgres:<pw>@shared-db:5432/ckk   # = RESTORE_DB_URL
# アプリ版数復元（任意）
COOLIFY_API_URL=http://coolify:8000/api/v1
COOLIFY_API_TOKEN=<Coolify API token>               # サーバの /data/coolify/source/.api-token と同じ
COOLIFY_APP_NAME=nextjs-web-main
# 既定で足りるもの: SEAWEED_CONTAINER=nextjs-seaweedfs  SEAWEED_VOLUME=nextjs-web_seaweed-data
```

admintools 側 `~/stacks/admintools/.env` にも同じトークンを:

```ini
RESTORE_AGENT_URL=http://restore-agent:9000
RESTORE_AGENT_TOKEN=<上と同じ値>
```

**前提**: restore-agent は `shared-db` 網（shared-db 到達）と `coolify` 網
（Coolify API 到達）に接続する。両外部ネットワークは既存。admintools は
`shared-db` 網で restore-agent に到達する。

**動作確認（非破壊）**:

```sh
# エージェント疎通（トークン設定状況）
docker exec restore-agent sh -c 'wget -qO- http://127.0.0.1:9000/healthz'
# 手動スナップショット（pre-restore/ に at-point フル）— UI の①ボタンと同じ
curl -s -X POST http://restore-agent:9000/snapshot -H "Authorization: Bearer $RESTORE_AGENT_TOKEN" \
  -H 'Content-Type: application/json' -d '{"reason":"smoke","actor":"ops"}'
```

実復元はダウンタイムを伴う破壊操作。UI からの実行前に、まず①手動
スナップショットでバックアップ経路が通ることを確認すること。
