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

## 表示名の日本語化（テーブル・列ラベル）

`sql/metadata-ja.sql` が King of Time (労務) データソースのテーブル・列の
表示名を、生の DB 名（`Hr Records` 等）ではなく意味の分かる日本語に揃える。
正式名はスキーマ本体（`kot.*` / `directory.*`）に付け、`public.*` の互換
ビュー（`shared-db/sql/metabase-compat.sql`）には「（旧）」を付けて新規
クエリで選ばれにくくしている。

適用先は Metabase の**アプリケーション DB（`metabase-db`）**。API キーが
管理者権限を持たないため REST ではなく直接 UPDATE する（冪等）。列を追加
したらこのファイルにラベルを足して再適用する:

```bash
ssh 192.168.50.15 "docker exec -i metabase-db psql -U metabase -d metabase -v ON_ERROR_STOP=1" \
  < docker-compose/metabase/sql/metadata-ja.sql
ssh 192.168.50.15 "cd ~/stacks/metabase && docker compose restart metabase"   # キャッシュ破棄
```
